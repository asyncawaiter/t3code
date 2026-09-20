import { OUTSIDE_SPACES } from "@t3tools/client-runtime/state/profiles";
import * as Equal from "effect/Equal";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
  Linking,
  Image,
} from "react-native";
import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import { randomUUID } from "expo-crypto";
import {
  CommandId,
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ThreadId,
  WorkItem,
  ChatAttachment,
  moveThreadsToSpace,
  workItemPrompt,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AppText as Text } from "../../components/AppText";
import { environmentServerConfigsAtom, serverEnvironment } from "../../state/server";
import { useWorkspaceState } from "../../state/workspace";
import { useProjects, useThreadShells } from "../../state/entities";
import { profileSourceAtom, profileSelectionAtom, useSaveProfiles } from "../../state/profiles";
import { useAtomCommand } from "../../state/use-atom-command";
import { useHomeThreadSelection } from "../home/home-thread-navigation";
import { chooseAction } from "../home/ProfilesPanel";
import { threadEnvironment } from "../../state/threads";
import { vcsEnvironment } from "../../state/vcs";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import {
  getComposerDraftSnapshot,
  setComposerDraftText,
  appendComposerDraftAttachments,
} from "../../state/use-composer-drafts";
import {
  pasteComposerClipboard,
  pickComposerImages,
  type DraftComposerAttachment,
} from "../../lib/composerImages";
import { prepareTurnAttachments } from "../../lib/attachmentUpload";
import { COMPOSER_ATTACHMENT_DIRECTORY } from "../../lib/composerAttachmentFiles";
import { usePreparedConnection } from "../../state/session";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { useRefreshAssetUrl, useAssetUrl, assetEnvironment } from "../../state/assets";
import { writeFileAtomically } from "../../lib/atomic-file";
import { SerializedAsyncQueue } from "../../lib/serialized-async-queue";

const Draft = Schema.Struct({
  device: Schema.NullOr(EnvironmentId),
  item: Schema.Struct({ ...WorkItem.fields, title: Schema.String }),
  base: Schema.optionalKey(WorkItem),
  separate: Schema.optionalKey(Schema.Boolean),
});
type Draft = typeof Draft.Type;
const decodeDraft = Schema.decodeUnknownSync(Draft);
const decodeAttachment = Schema.decodeUnknownSync(ChatAttachment);
const decodeTask = Schema.decodeUnknownSync(WorkItem);
const writes = new SerializedAsyncQueue();
async function draftFile() {
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, "parked-work-draft.json");
}
const fieldStyle = "min-h-11 rounded-xl bg-subtle px-3 py-2 text-base text-foreground";

export function WorkItemsPanel({
  search = "",
  deviceFilter = null,
  projectFilter = null,
}: {
  search?: string;
  deviceFilter?: string | null;
  projectFilter?: string | null;
}) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const { environments } = useWorkspaceState();
  const { profiles } = useAtomValue(profileSourceAtom);
  const selection = useAtomValue(profileSelectionAtom);
  const projects = useProjects();
  const threads = useThreadShells();
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const create = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const createWorktree = useAtomCommand(vcsEnvironment.createWorktree, { reportFailure: false });
  const refs = useAtomQueryRunner(vcsEnvironment.listRefs, { reportFailure: false, refresh: true });
  const saveProfiles = useSaveProfiles();
  const openChat = useHomeThreadSelection();
  const [draft, setDraft] = useState<Draft | null>(null);
  const connection = usePreparedConnection(draft?.device ?? null);
  const assetUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    refresh: true,
    reportFailure: false,
  });
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(false);
  const separate = draft?.separate ?? false;
  const setSeparate = (value: boolean) =>
    setDraft((current) => (current ? { ...current, separate: value } : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    void draftFile()
      .then(async (file) => {
        if (file.exists) {
          const saved = decodeDraft(JSON.parse(await file.text()));
          if (!disposed) setDraft(saved);
        }
      })
      .catch(() => {
        if (!disposed) setError("Could not restore the local task draft.");
      })
      .finally(() => {
        if (!disposed) setLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    void writes
      .run(async () => {
        const file = await draftFile();
        if (draft) await writeFileAtomically(file, JSON.stringify(draft));
        else if (file.exists) file.delete();
      })
      .catch(() => setError("Could not keep the draft on this phone. Save it before closing."));
  }, [draft, loaded]);
  const tasks = [...configs].flatMap(([device, config]) =>
    (config.settings.workItems ?? []).map((item) => ({ device, item })),
  );
  const shown = tasks.filter(
    ({ device, item }) =>
      (!selection.profileId || item.profileId === selection.profileId) &&
      (!selection.spaceId ||
        (selection.spaceId === OUTSIDE_SPACES
          ? item.spaceId === null
          : item.spaceId === selection.spaceId)) &&
      (!deviceFilter || device === deviceFilter) &&
      (!projectFilter || `${device}:${item.projectId}` === projectFilter) &&
      `${item.title} ${item.notes}`.toLowerCase().includes(search.toLowerCase()) &&
      (completed || item.status !== "done"),
  );
  const change = (patch: Partial<WorkItem>) =>
    setDraft((current) => (current ? { ...current, item: { ...current.item, ...patch } } : null));
  const capture = () => {
    if (!draft) {
      const now = new Date().toISOString();
      setDraft({
        device:
          environments.find(
            (env) =>
              env.connectionState === "connected" &&
              configs.get(env.environmentId)?.environment.capabilities.workItems,
          )?.environmentId ?? null,
        item: {
          id: randomUUID(),
          title: "",
          notes: "",
          brief: "",
          status: "parked",
          profileId: selection.profileId,
          spaceId: selection.spaceId === OUTSIDE_SPACES ? null : selection.spaceId,
          projectId: null,
          source: null,
          threadId: null,
          links: [],
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    setVisible(true);
  };
  async function save(item = draft?.item) {
    if (!draft?.device || !item) throw new Error("Choose a connected device.");
    if (!configs.get(draft.device)?.environment.capabilities.workItems)
      throw new Error("Update this device to support saved tasks.");
    const next = decodeTask({
      ...item,
      title: item.title.trim(),
      links: item.links.map((link) => link.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    });
    const result = await update({
      environmentId: draft.device,
      input: { patch: { workItems: [next] }, baseWorkItems: draft.base ? [draft.base] : [] },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    const saved = result.value.workItems?.find((task) => task.id === next.id) ?? next;
    setDraft({ device: draft.device, item: saved, base: saved, separate });
    return saved;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task.");
    } finally {
      setBusy(false);
    }
  }
  async function attachImages(paste: boolean) {
    if (!draft?.device) throw new Error("Choose a connected device first.");
    const input = { existingCount: draft.item.attachments?.length ?? 0 };
    const result = paste ? await pasteComposerClipboard(input) : await pickComposerImages(input);
    if (result.error) throw new Error(result.error);
    if (!result.images.length) {
      if (paste) throw new Error("Copy a screenshot first, then paste it here.");
      return;
    }
    const uploaded = await prepareTurnAttachments({
      environmentId: draft.device,
      attachments: result.images,
      supportsImageUploads: true,
    });
    if (uploaded.status !== "ready") return;
    const attachments = [
      ...(draft.item.attachments ?? []),
      ...uploaded.attachments.map((attachment) => decodeAttachment(attachment)),
    ];
    change({ attachments });
    if (draft.item.title.trim()) await save({ ...draft.item, attachments });
  }
  async function prepareChat() {
    if (!draft?.device) return;
    const environmentId = draft.device;
    let item = await save();
    const project = projects.find(
      (folder) => folder.environmentId === environmentId && folder.id === item.projectId,
    );
    if (!project) throw new Error("Choose a folder first.");
    const threadId = item.threadId ?? ThreadId.make(`task-${item.id}`);
    if (
      !threads.some((thread) => thread.environmentId === environmentId && thread.id === threadId)
    ) {
      if (item.threadId)
        throw new Error("The linked chat is unavailable. Restore it or unlink it first.");
      const modelSelection =
        project.defaultModelSelection ?? configs.get(environmentId)?.settings.defaultModelSelection;
      if (!modelSelection) throw new Error("Choose a default model on the device first.");
      let branch: string | null = null,
        worktreePath: string | null = null;
      if (separate) {
        const listed = await refs({
          environmentId,
          input: {
            cwd: project.workspaceRoot,
            includeGraph: true,
            graphCommitLimit: 1,
            refresh: true,
          },
        });
        if (listed._tag === "Failure") throw squashAtomCommandFailure(listed);
        const existing = listed.value.graph?.worktrees.find(
          (tree) => tree.branch === `task/${item.id}`,
        );
        if (existing) {
          branch = existing.branch;
          worktreePath = existing.path;
        } else {
          const result = await createWorktree({
            environmentId,
            input: {
              cwd: project.workspaceRoot,
              refName: "HEAD",
              newRefName: `task/${item.id}`,
              path: null,
            },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          branch = result.value.worktree.refName;
          worktreePath = result.value.worktree.path;
        }
      }
      const result = await create({
        environmentId,
        input: {
          commandId: CommandId.make(`task-create-${item.id}`),
          threadId,
          projectId: project.id,
          title: item.title,
          modelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: "default",
          branch,
          worktreePath,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    }
    // The first save may have advanced updatedAt; preserve that exact base.
    const linked = {
      ...item,
      threadId,
      status: item.status === "parked" ? ("ready" as const) : item.status,
      updatedAt: new Date().toISOString(),
    };
    const result = await update({
      environmentId,
      input: { patch: { workItems: [linked] }, baseWorkItems: [item] },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    item = result.value.workItems?.find((task) => task.id === item.id) ?? linked;
    setDraft({ device: environmentId, item, base: item, separate });
    if (item.profileId)
      await saveProfiles((all) =>
        all.map((profile) =>
          profile.id === item.profileId
            ? moveThreadsToSpace(
                {
                  ...profile,
                  projectKeys: [
                    ...new Set([...profile.projectKeys, `${environmentId}:${project.id}`]),
                  ],
                },
                [
                  {
                    threadKey: `${environmentId}:${threadId}`,
                    projectKey: `${environmentId}:${project.id}`,
                  },
                ],
                item.spaceId,
              )
            : profile,
        ),
      );
    const key = `${environmentId}:${threadId}`;
    const composer = getComposerDraftSnapshot(key);
    if (!composer.text.trim() && !composer.attachments.length) {
      const { Directory, File, Paths } = await import("expo-file-system");
      const copied: InstanceType<typeof File>[] = [];
      try {
        const attachments: DraftComposerAttachment[] = [];
        const directory = new Directory(Paths.document, COMPOSER_ATTACHMENT_DIRECTORY);
        directory.create({ intermediates: true, idempotent: true });
        for (const attachment of item.attachments ?? []) {
          if (connection._tag !== "Some")
            throw new Error("Reconnect this device to load task attachments.");
          const asset = await assetUrl({
            environmentId,
            input: {
              resource: {
                _tag: "attachment",
                attachmentId: attachment.id,
                fileName: attachment.name,
                mimeType: attachment.mimeType,
              },
            },
          });
          if (asset._tag === "Failure") throw squashAtomCommandFailure(asset);
          const url = resolveAssetUrl(connection.value.httpBaseUrl, asset.value.relativeUrl);
          if (!url) throw new Error("The attachment is unavailable.");
          const file = new File(directory, randomUUID());
          copied.push(file);
          await File.downloadFileAsync(url, file);
          attachments.push(
            attachment.type === "image"
              ? {
                  ...attachment,
                  id: randomUUID(),
                  type: "image",
                  fileUri: file.uri,
                  previewUri: file.uri,
                }
              : { ...attachment, id: randomUUID(), type: "file", fileUri: file.uri },
          );
        }
        const latest = getComposerDraftSnapshot(key);
        if (latest.text.trim() || latest.attachments.length)
          throw new Error("The chat draft changed. Clear it before loading the brief.");
        appendComposerDraftAttachments(key, attachments);
        copied.length = 0;
        setComposerDraftText(key, workItemPrompt(item));
      } finally {
        for (const file of copied) if (file.exists) file.delete();
      }
    }
    setVisible(false);
    setDraft(null);
    openChat({ environmentId, id: threadId });
  }
  const item = draft?.item;
  const profile = profiles.find((owner) => owner.id === item?.profileId);
  const button = (title: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={action}
      className="min-h-11 justify-center rounded-xl bg-subtle px-3"
    >
      <Text className={disabled || busy ? "text-foreground-muted" : "text-foreground"}>
        {title}
      </Text>
    </Pressable>
  );
  return (
    <View className="gap-2 px-3 py-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-t3-semibold text-foreground">Planned work</Text>
        {button(draft ? "Resume capture" : "+ Task", capture, !loaded)}
      </View>
      {shown.map((task) => (
        <Pressable
          key={`${task.device}:${task.item.id}`}
          accessibilityRole="button"
          onPress={() => {
            if (draft && draft.item.id !== task.item.id && !Equal.equals(draft.item, draft.base)) {
              setError("Save or discard your unfinished capture before opening another task.");
              setVisible(true);
              return;
            }
            setDraft({ ...task, base: task.item });
            setVisible(true);
          }}
          className="gap-1 rounded-xl bg-subtle p-3"
        >
          <Text className="font-t3-semibold text-foreground">{task.item.title}</Text>
          <Text numberOfLines={2} className="text-sm text-foreground-muted">
            {task.item.brief || task.item.notes}
          </Text>
          <Text className="text-xs text-foreground-muted">
            {task.item.status} ·{" "}
            {environments.find((env) => env.environmentId === task.device)?.environmentLabel ??
              "Offline device"}
          </Text>
        </Pressable>
      ))}
      {button(completed ? "Hide completed tasks" : "Show completed tasks", () =>
        setCompleted(!completed),
      )}
      <Modal
        visible={visible && !!draft}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !busy && setVisible(false)}
      >
        <ScrollView
          className="flex-1 bg-screen"
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 50 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-t3-semibold text-foreground">Task</Text>
            {button("Close", () => setVisible(false))}
          </View>
          {item && (
            <>
              <TextInput
                accessibilityLabel="Task outcome"
                placeholder="What needs doing?"
                maxLength={240}
                value={item.title}
                onChangeText={(title) => change({ title })}
                className={fieldStyle}
              />
              <TextInput
                accessibilityLabel="Task notes"
                placeholder="A thought, a call, a request, or context for later"
                multiline
                maxLength={32000}
                value={item.notes}
                onChangeText={(notes) => change({ notes })}
                className={`${fieldStyle} min-h-28`}
              />
              {button(`Profile: ${profile?.name ?? "Unassigned"}`, () =>
                chooseAction("Profile", [
                  { title: "Unassigned", action: () => change({ profileId: null, spaceId: null }) },
                  ...profiles.map((owner) => ({
                    title: owner.name,
                    action: () => change({ profileId: owner.id, spaceId: null }),
                  })),
                ]),
              )}
              {button(
                `Space: ${profile?.spaces?.find((space) => space.id === item.spaceId)?.name ?? "Unsorted"}`,
                () =>
                  chooseAction("Space", [
                    { title: "Unsorted", action: () => change({ spaceId: null }) },
                    ...(profile?.spaces ?? []).map((space) => ({
                      title: space.name,
                      action: () => change({ spaceId: space.id }),
                    })),
                  ]),
              )}
              {button(
                `Device: ${environments.find((env) => env.environmentId === draft?.device)?.environmentLabel ?? "Choose"}`,
                () =>
                  chooseAction(
                    "Device",
                    environments.map((env) => ({
                      title: env.environmentLabel,
                      action: () =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                device: env.environmentId,
                                item: { ...current.item, projectId: null },
                              }
                            : null,
                        ),
                    })),
                  ),
                !!draft?.base,
              )}
              {button(
                `Folder: ${projects.find((folder) => folder.id === item.projectId && folder.environmentId === draft?.device)?.title ?? "Choose later"}`,
                () =>
                  chooseAction(
                    "Folder",
                    projects
                      .filter((folder) => folder.environmentId === draft?.device)
                      .map((folder) => ({
                        title: `${folder.title} · ${folder.workspaceRoot}`,
                        action: () => change({ projectId: folder.id }),
                      })),
                  ),
                !!item.threadId,
              )}
              <TextInput
                accessibilityLabel="Source links"
                placeholder="Source links, one per line"
                multiline
                value={item.links.join("\n")}
                onChangeText={(value) => change({ links: value.split("\n") })}
                className={fieldStyle}
              />
              <Text className="font-t3-semibold text-foreground">Handoff brief</Text>
              <TextInput
                accessibilityLabel="Handoff brief"
                placeholder="Outcome, decisions, files, open questions, first step"
                multiline
                maxLength={32000}
                value={item.brief}
                onChangeText={(brief) => change({ brief })}
                className={`${fieldStyle} min-h-24`}
              />
              {button(
                item.preparation?.state === "queued"
                  ? "Cancel preparation"
                  : "Prepare brief with agent",
                () =>
                  void run(async () => {
                    await save({
                      ...item,
                      preparation:
                        item.preparation?.state === "queued"
                          ? null
                          : { requestedAt: new Date().toISOString(), state: "queued" },
                    });
                  }),
                (!item.source && !item.threadId) || item.preparation?.state === "running",
              )}
              {item.preparation && (
                <Text className="text-sm text-foreground-muted">
                  {item.preparation.error ??
                    (item.preparation.state === "queued"
                      ? "Waiting for the chat's current turn to finish."
                      : "Preparing in the source chat.")}
                </Text>
              )}
              {button(`Status: ${item.status}`, () =>
                chooseAction(
                  "Status",
                  (["parked", "ready", "working", "done"] as const).map((status) => ({
                    title: status,
                    action: () => change({ status }),
                  })),
                ),
              )}
              {!item.threadId && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground">Separate worktree</Text>
                  <Switch value={separate} onValueChange={setSeparate} />
                </View>
              )}
              {button(item.threadId ? "Change or unlink chat" : "Link existing chat", () =>
                chooseAction("Chat", [
                  { title: "No linked chat", action: () => change({ threadId: null }) },
                  ...threads
                    .filter(
                      (thread) =>
                        thread.environmentId === draft?.device &&
                        thread.projectId === item.projectId,
                    )
                    .map((thread) => ({
                      title: thread.title,
                      action: () => change({ threadId: thread.id }),
                    })),
                ]),
              )}
              {item.source &&
                button("Open source chat", () => {
                  setVisible(false);
                  openChat({
                    environmentId: item.source!.environmentId,
                    id: item.source!.threadId,
                  });
                })}
              <View className="flex-row gap-2">
                {button(
                  "Paste screenshot",
                  () => void run(() => attachImages(true)),
                  !draft.device,
                )}
                {button(
                  "Add screenshots",
                  () => void run(() => attachImages(false)),
                  !draft.device,
                )}
              </View>
              {item.attachments?.map((attachment) => (
                <View key={attachment.id} className="flex-row items-center justify-between gap-2">
                  <TaskAttachment
                    environmentId={draft.device}
                    attachment={attachment}
                    onError={setError}
                  />
                  {button(`Remove ${attachment.name}`, () =>
                    change({
                      attachments:
                        item.attachments?.filter((file) => file.id !== attachment.id) ?? [],
                    }),
                  )}
                </View>
              ))}
              {error && (
                <Text accessibilityRole="alert" className="text-sm text-foreground">
                  {error}
                </Text>
              )}
              {button("Discard local draft", () => {
                setDraft(null);
                setVisible(false);
              })}
              {button(
                "Save task",
                () =>
                  void run(async () => {
                    await save();
                    setDraft(null);
                    setVisible(false);
                  }),
                !item.title.trim(),
              )}
              {button(
                item.threadId ? "Open chat" : "Prepare chat",
                () => void run(prepareChat),
                !item.title.trim() || !item.projectId,
              )}
            </>
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

function TaskAttachment({
  environmentId,
  attachment,
  onError,
}: {
  environmentId: EnvironmentId | null;
  attachment: ChatAttachment;
  onError: (error: string) => void;
}) {
  const url = useAssetUrl(
    environmentId,
    attachment.type === "image"
      ? {
          _tag: "attachment",
          attachmentId: attachment.id,
          fileName: attachment.name,
          mimeType: attachment.mimeType,
        }
      : null,
  );
  const refresh = useRefreshAssetUrl(environmentId, {
    _tag: "attachment",
    attachmentId: attachment.id,
    fileName: attachment.name,
    mimeType: attachment.mimeType,
  });
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-11 justify-center"
      onPress={() => {
        void refresh()
          .then((url) => {
            if (!url) throw new Error("Reconnect the task's device to open this attachment.");
            return Linking.openURL(url);
          })
          .catch((cause) =>
            onError(cause instanceof Error ? cause.message : "Could not open the attachment."),
          );
      }}
    >
      {url && (
        <Image
          source={{ uri: url }}
          style={{ width: 56, height: 56, borderRadius: 6 }}
          accessibilityLabel="Screenshot attachment"
        />
      )}
      <Text className="text-sm text-foreground">{attachment.name}</Text>
    </Pressable>
  );
}
