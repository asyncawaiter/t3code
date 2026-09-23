import { prepareTaskDraft } from "./taskHandoff";
import { useOpenChatInColumns } from "../../hooks/useOpenChatInColumns";
import { workItemStage, returnWorkItemToPlanned } from "@t3tools/contracts";
import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { assistantMessageHash } from "../../lib/assistantMessageNavigation";
import { MessageId } from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { uploadTaskFile, taskAttachmentUrl } from "./taskAttachments";
import { taskFolders } from "@t3tools/client-runtime/state/profiles";
import { randomUUID } from "../../lib/utils";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandId,
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ThreadId,
  WorkItem,
  moveThreadsToSpace,
  profileForProject,
  indexProfileSpaces,
  workItemChats,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { shouldHandleComposerAttachmentPaste } from "../chat/composerAttachmentFiles";
import { ExpandedImageDialog } from "../chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "../chat/ExpandedImagePreview";
import type { ChatAttachment } from "@t3tools/contracts";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { TaskSelect } from "./TaskSelect";
import { QuickTaskCapture } from "./QuickTaskCapture";
import { TaskCaptureCoordinator } from "./TaskCaptureCoordinator";
import { useTaskCaptures } from "./taskCaptureStorage";
import {
  PaperclipIcon,
  ExternalLinkIcon,
  FolderIcon,
  FileIcon,
  XIcon,
  ChevronDownIcon,
  MessageSquareIcon,
} from "lucide-react";
import {
  useWorkItemEditor,
  useWorkItems,
  useSaveWorkItem,
  type WorkItemRequest,
  workItemDraftKey,
} from "../../workItems";
import { useEnvironments } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { usePrimarySettings } from "../../hooks/useSettings";
import { useUiStateStore } from "../../uiStateStore";
import { environmentServerConfigsAtom } from "../../state/server";
import { useSaveProfiles } from "../../hooks/useProfileSync";
import { threadEnvironment } from "../../state/threads";
import { vcsEnvironment } from "../../state/vcs";
import { useAtomCommand } from "../../state/use-atom-command";

const Draft = Schema.NullOr(
  Schema.Struct({
    task: Schema.Struct({ ...WorkItem.fields, title: Schema.String }),
    base: Schema.optionalKey(WorkItem),
    device: Schema.NullOr(EnvironmentId),
    separate: Schema.optionalKey(Schema.Boolean),
    launchThreadId: Schema.optionalKey(ThreadId),
  }),
);
const decodeTask = Schema.decodeUnknownSync(WorkItem);

export function WorkItemDialog() {
  const closeCapture = useRef<(() => Promise<boolean>) | null>(null);
  const request = useWorkItemEditor((state) => state.request);
  const ready = useTaskCaptures((state) => state.ready);
  return (
    <>
      <TaskCaptureCoordinator />
      {request &&
        (request.item && !request.localCaptureId ? (
          <TaskForm key={request.item.id} request={request} />
        ) : (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open)
                void (closeCapture.current?.() ?? Promise.resolve(true)).then((saved) => {
                  if (saved) useWorkItemEditor.setState({ request: null });
                });
            }}
          >
            <DialogPopup className="max-w-md">
              <DialogHeader>
                <DialogTitle>New task</DialogTitle>
              </DialogHeader>
              <div className="px-5 pb-5">
                {ready ? (
                  <QuickTaskCapture
                    closeRef={closeCapture}
                    request={request}
                    onSaved={() => useWorkItemEditor.setState({ request: null })}
                  />
                ) : (
                  "Opening local drafts..."
                )}
              </div>
            </DialogPopup>
          </Dialog>
        ))}
    </>
  );
}

export function TaskForm({
  request,
  inline = false,
  onClose,
  onBusyChange,
}: {
  request: WorkItemRequest;
  inline?: boolean;
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [section, setSection] = useState("context");
  const fileInput = useRef<HTMLInputElement>(null);
  const destinationPanel = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<ExpandedImagePreview | null>(null);
  const navigate = useNavigate();
  const openInColumns = useOpenChatInColumns();
  const { environments } = useEnvironments();
  const projects = useProjects();
  const threads = useThreadShells();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const ui = useUiStateStore();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const draftKey = workItemDraftKey(request);
  const [draft, setDraft] = useLocalStorage(`t3.task-draft.${draftKey}`, null, Draft);
  const sourcePlacement = request.source
    ? indexProfileSpaces(profiles).get(`${request.source.environmentId}:${request.source.threadId}`)
    : undefined;
  const sourceProfile =
    sourcePlacement?.profile ??
    (request.projectId && request.environmentId
      ? profileForProject(profiles, `${request.environmentId}:${request.projectId}`)
      : undefined);
  const storageDevice = request.environmentId!;
  const [device, setDevice] = useState(
    draft?.device ??
      (request.item?.executionEnvironmentId !== undefined
        ? request.item.executionEnvironmentId
        : request.environmentId) ??
      null,
  );
  const [base, setBase] = useState(draft?.base ?? request.item);
  const [task, setTask] = useState<WorkItem>(
    () =>
      draft?.task ??
      request.item ?? {
        id: randomUUID(),
        title: request.title ?? "",
        notes: request.notes ?? "",
        attachments: request.attachments ?? [],
        brief: "",
        status: "parked",
        profileId:
          request.profileId !== undefined
            ? request.profileId === "all"
              ? null
              : request.profileId
            : request.source
              ? (sourceProfile?.id ?? null)
              : ui.activeProfileId,
        spaceId:
          request.spaceId !== undefined
            ? request.spaceId
            : (sourcePlacement?.space.id ??
              (request.source
                ? null
                : ui.spaceSelection?.filter && ui.spaceSelection.filter !== OUTSIDE_SPACES
                  ? ui.spaceSelection.filter
                  : null)),
        projectId: request.projectId ?? null,
        source: request.source ?? null,
        threadId: null,
        links: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [preparationOpen, setPreparationOpen] = useState(!!task.preparation);
  const [destinationOpen, setDestinationOpen] = useState(false);
  useEffect(() => {
    if (destinationOpen && !inline) destinationPanel.current?.scrollIntoView({ block: "nearest" });
  }, [destinationOpen, inline]);
  const [briefOpen, setBriefOpen] = useState(!!task.brief);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [destinationKind, setDestinationKind] = useState<"new" | "existing">(
    task.threadId ? "existing" : "new",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [separate, setSeparate] = useState(draft?.separate ?? false);
  const [nextThreadId, setNextThreadId] = useState(
    () => draft?.launchThreadId ?? ThreadId.make(`task-${randomUUID()}`),
  );
  const allTasks = useWorkItems();
  const live = allTasks.find(
    (entry) => entry.environmentId === storageDevice && entry.item.id === task.id,
  )?.item;
  useEffect(() => {
    if (live && base && Equal.equals(task, base) && !Equal.equals(live, base)) {
      // Refresh a pristine form when a remote agent saves its handoff brief.
      // eslint-disable-next-line react/set-state-in-effect
      setTask(live);
      setBase(live);
    }
  }, [live, base, task]);
  useEffect(() => {
    if (!Equal.equals(task, base) || separate)
      setDraft({ task, ...(base ? { base } : {}), device, separate, launchThreadId: nextThreadId });
  }, [task, base, device, separate, setDraft, nextThreadId]);
  const save = useSaveWorkItem();
  const saveProfiles = useSaveProfiles();
  const create = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const listRefs = useAtomQueryRunner(vcsEnvironment.readRefs, {
    reportFailure: false,
    refresh: true,
  });
  const createWorktree = useAtomCommand(vcsEnvironment.createWorktree, { reportFailure: false });
  const profile = profiles.find((item) => item.id === task.profileId);
  const folders = taskFolders(projects, device, profile, task.spaceId);
  const project = folders.find(
    (folder) => folder.environmentId === device && folder.id === task.projectId,
  );
  const linked = threads.find(
    (thread) => thread.environmentId === device && thread.id === (task.threadId ?? nextThreadId),
  );
  const connected = environments.some(
    (env) => env.environmentId === device && env.connection.phase === "connected",
  );
  const storageConnected = environments.some(
    (env) =>
      env.environmentId === storageDevice &&
      env.connection.phase === "connected" &&
      env.serverConfig?.environment.capabilities.taskCapture,
  );
  const associated = workItemChats(task, storageDevice);
  const change = (patch: Partial<WorkItem>) => setTask((current) => ({ ...current, ...patch }));
  const close = () => (onClose ? onClose() : useWorkItemEditor.setState({ request: null }));

  async function persist(next = task) {
    if (!storageDevice) throw new Error("Task storage is unavailable.");
    const validated = decodeTask({
      ...next,
      executionEnvironmentId: device,
      projectId: next.threadId
        ? next.projectId
        : (folders.find((folder) => folder.id === next.projectId)?.id ?? null),
      title: next.title.trim(),
      links: next.links.map((link) => link.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    });
    const saved = await save(storageDevice, validated, base);
    setBase(saved);
    setTask(saved);
    setDraft({ task: saved, base: saved, device, separate, launchThreadId: nextThreadId });
    return saved;
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) {
      setError("Wait for the current action to finish, then try again.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this task.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    await run(async () => {
      if (!storageConnected)
        throw new Error("Reconnect the task storage device to add files to this saved task.");
      if ((task.attachments?.length ?? 0) + files.length > 8)
        throw new Error("Attach up to 8 files.");
      const attachments = [...(task.attachments ?? [])];
      for (const file of files) {
        attachments.push(await uploadTaskFile(storageDevice, file));
        change({ attachments: [...attachments] });
      }
    });
  }
  async function openChat() {
    if (!device || !project) throw new Error("Choose the folder where this work belongs.");
    let saved = await persist();
    const threadId = saved.threadId ?? nextThreadId;
    if (linked && linked.projectId !== project.id)
      throw new Error(
        "The previous attempt created a chat in another folder. Select that folder to reopen it.",
      );
    if (!linked) {
      if (saved.threadId)
        throw new Error(
          "The linked chat is unavailable. Restore it or unlink it before preparing another chat.",
        );
      const modelSelection =
        project.defaultModelSelection ??
        configs.get(device)?.settings.defaultModelSelection ??
        threads.find((thread) => thread.environmentId === device)?.modelSelection;
      if (!modelSelection)
        throw new Error("Choose a default model for this folder in Settings first.");
      let worktreePath: string | null = null;
      let branch: string | null = null;
      if (separate) {
        const refs = await listRefs({
          environmentId: device,
          input: {
            cwd: project.workspaceRoot,
            includeGraph: true,
            graphCommitLimit: 1,
            refresh: true,
          },
        });
        if (refs._tag === "Failure") throw squashAtomCommandFailure(refs);
        const existing = refs.value.graph?.worktrees.find(
          (item) => item.branch === `task/${threadId}`,
        );
        if (existing) {
          worktreePath = existing.path;
          branch = existing.branch;
        } else {
          const result = await createWorktree({
            environmentId: device,
            input: {
              cwd: project.workspaceRoot,
              refName: "HEAD",
              newRefName: `task/${threadId}`,
              path: null,
            },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          worktreePath = result.value.worktree.path;
          branch = result.value.worktree.refName;
        }
      }
      const result = await create({
        environmentId: device,
        input: {
          commandId: CommandId.make(`task-create-${threadId}`),
          threadId,
          projectId: project.id,
          title: saved.title,
          modelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: "default",
          branch,
          worktreePath,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    }
    if (saved.profileId && !task.threadId)
      await saveProfiles((current) =>
        current.map((owner) =>
          owner.id === saved.profileId
            ? moveThreadsToSpace(
                {
                  ...owner,
                  projectKeys: [...new Set([...owner.projectKeys, `${device}:${project.id}`])],
                },
                [{ threadKey: `${device}:${threadId}`, projectKey: `${device}:${project.id}` }],
                saved.spaceId,
              )
            : owner,
        ),
      );
    saved = await save(
      storageDevice,
      {
        ...saved,
        threadId,
        executionEnvironmentId: device,
        chats: workItemChats(saved, storageDevice).some(
          (chat) => chat.environmentId === device && chat.threadId === threadId,
        )
          ? workItemChats(saved, storageDevice)
          : [
              ...workItemChats(saved, storageDevice),
              { environmentId: device, threadId, purpose: "Work" },
            ],
        status: saved.status,
        updatedAt: new Date().toISOString(),
      },
      saved,
    );
    setBase(saved);
    setTask(saved);
    await prepareTaskDraft(
      { environmentId: storageDevice, item: saved },
      { environmentId: device, threadId },
    );
    if (
      !(await openInColumns({
        environmentId: device,
        id: threadId,
        title: linked?.title ?? saved.title,
      }))
    )
      await navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: device, threadId },
      });
    setDraft(null);
    close();
  }

  const Popup = inline ? "div" : DialogPopup;
  const Footer = inline ? "div" : DialogFooter;
  const content = (
    <>
      <Popup
        className={
          inline
            ? "@container flex h-full min-w-0 flex-col overflow-hidden"
            : "max-w-lg overflow-hidden"
        }
        {...(inline ? {} : { showCloseButton: !busy })}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (
            !shouldHandleComposerAttachmentPaste({
              files,
              plainText: event.clipboardData.getData("text/plain"),
            })
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          void addFiles(files);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          event.stopPropagation();
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {!inline && (
          <DialogHeader className="shrink-0 px-5 pb-4 pt-5">
            <DialogTitle className="font-sans text-base">
              {base ? "Task details" : task.source ? "Create task from this chat" : "New task"}
            </DialogTitle>
            {!base && (
              <p className="text-xs text-muted-foreground">
                {task.source
                  ? "Saves a separate task with a link to the source chat. Nothing is added to that chat."
                  : "Save work for later. A chat is optional."}
              </p>
            )}
          </DialogHeader>
        )}
        {inline && (
          <div
            role="group"
            aria-label="Task sections"
            className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-2"
          >
            {(
              [
                ["context", "Context"],
                ["files", "Files"],
                ["prepare", "Prepare"],
                ["chat", "Chat"],
                ["more", "More"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="xs"
                variant={section === key ? "secondary" : "ghost-muted"}
                aria-pressed={section === key}
                disabled={busy}
                onClick={() => {
                  setSection(key);
                  if (key === "chat") setDestinationOpen(true);
                }}
              >
                {label}
              </Button>
            ))}
            {!Equal.equals(task, base) && (
              <Button
                size="xs"
                variant="outline"
                className="ml-auto"
                disabled={busy || !task.title.trim() || !storageConnected}
                onClick={() =>
                  void run(async () => {
                    await persist();
                    setDraft(null);
                  })
                }
              >
                Save changes
              </Button>
            )}
          </div>
        )}
        <div
          className={
            inline
              ? "min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
              : "min-h-0 flex-1 overflow-y-auto px-5 pb-5"
          }
        >
          <fieldset
            disabled={busy}
            className={
              inline
                ? "min-w-0 [&_button]:text-xs [&_input]:text-xs [&_[data-slot=select-trigger]]:h-8"
                : "min-w-0 space-y-4"
            }
          >
            <div
              hidden={inline && section !== "context"}
              className={
                inline
                  ? "grid grid-cols-3 items-start gap-3 [&>label:nth-child(2)]:col-start-2 [&>label:nth-child(2)]:row-span-2 [&>label:nth-child(2)]:row-start-1 [&>div]:col-start-3 [&>div]:row-span-2 [&>div]:row-start-1"
                  : "space-y-3"
              }
            >
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                Outcome
                <Input
                  autoFocus={!inline}
                  aria-label="Task title"
                  placeholder="What needs doing?"
                  maxLength={240}
                  className="font-medium text-foreground"
                  value={task.title}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                Request and context
                <Textarea
                  aria-label="Task notes"
                  className={
                    inline
                      ? "[&_textarea]:h-28 [&_textarea]:min-h-0 [&_textarea]:resize-none [&_textarea]:text-xs"
                      : "[&_textarea]:min-h-24 [&_textarea]:max-h-40 [&_textarea]:resize-y [&_textarea]:font-normal"
                  }
                  maxLength={32000}
                  placeholder="A thought, a call, or a request to return to..."
                  value={task.notes}
                  onChange={(e) => change({ notes: e.target.value })}
                />
              </label>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                Paste screenshots here or drop files into this form.
                {busy ? " Attaching or saving..." : ""}
              </p>
              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                <div
                  className={
                    inline
                      ? "hidden"
                      : inline
                        ? "flex flex-wrap items-center gap-1 text-xs"
                        : "flex items-center gap-2 text-xs"
                  }
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {profile?.name ?? "Unassigned"} /{" "}
                    {profile?.spaces?.find((space) => space.id === task.spaceId)?.name ??
                      "Unsorted"}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    {workItemStage(task)}
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-expanded={placementOpen}
                    onClick={() => setPlacementOpen(!placementOpen)}
                  >
                    Change
                  </Button>
                </div>
                {(inline || placementOpen) && (
                  <div
                    className={
                      inline
                        ? "grid grid-cols-1 gap-2"
                        : "mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3"
                    }
                  >
                    <TaskSelect
                      label="Profile"
                      ariaLabel="Task profile"
                      value={task.profileId ?? ""}
                      onChange={(value) =>
                        change({
                          profileId: value || null,
                          spaceId: null,
                          projectId: null,
                          threadId: null,
                          chats: associated,
                        })
                      }
                      options={[
                        { value: "", label: "Unassigned" },
                        ...profiles.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                    <TaskSelect
                      label="Space"
                      ariaLabel="Task space"
                      value={task.spaceId ?? ""}
                      disabled={!profile}
                      onChange={(value) =>
                        change({
                          spaceId: value || null,
                          projectId: null,
                          threadId: null,
                          chats: associated,
                        })
                      }
                      options={[
                        { value: "", label: "Unsorted" },
                        ...(profile?.spaces ?? []).map((space) => ({
                          value: space.id,
                          label: space.name,
                        })),
                      ]}
                    />
                  </div>
                )}
              </div>
            </div>
            <div hidden={inline && section !== "files"}>
              <details
                open={inline || !!task.links.length || !!task.attachments?.length || !!task.source}
                className="group rounded-lg border border-border/60"
              >
                <summary
                  className={
                    inline
                      ? "hidden"
                      : "flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden"
                  }
                >
                  <PaperclipIcon className="size-3.5 text-muted-foreground" />
                  Sources and files
                  <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground group-open:rotate-180" />
                </summary>
                <div
                  className={
                    inline
                      ? "grid grid-cols-2 items-start gap-3 p-2 [&>ul]:col-start-2 [&>ul]:row-start-2 [&>ul]:max-h-20 [&>ul]:overflow-y-auto [&>div]:col-start-2 [&>div]:row-start-1 [&>div:first-child]:col-start-1 [&>div:first-child]:row-span-2"
                      : "space-y-3 border-t border-border/50 p-3"
                  }
                >
                  <Textarea
                    aria-label="Task source links"
                    size="sm"
                    className={
                      inline
                        ? "col-start-1 row-span-2 row-start-1 [&_textarea]:h-28 [&_textarea]:min-h-0 [&_textarea]:resize-none [&_textarea]:text-xs"
                        : "[&_textarea]:max-h-28 [&_textarea]:font-normal"
                    }
                    placeholder="Slack, Google Chat, issues, documents. One link per line."
                    value={task.links.join("\n")}
                    onChange={(e) => change({ links: e.target.value.split("\n") })}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      className="hidden"
                      aria-label="Task attachment files"
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        void addFiles(files);
                      }}
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!storageConnected || (task.attachments?.length ?? 0) >= 8}
                      onClick={() => fileInput.current?.click()}
                    >
                      <PaperclipIcon className="size-3" />
                      Attach files
                    </Button>
                    {task.source && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          close();
                          void navigate({
                            to: "/$environmentId/$threadId",
                            params: task.source!,
                            ...(task.source?.messageId
                              ? {
                                  hash: assistantMessageHash(MessageId.make(task.source.messageId)),
                                }
                              : {}),
                          });
                        }}
                      >
                        <ExternalLinkIcon className="size-3" />
                        Source chat
                      </Button>
                    )}
                  </div>
                  {task.attachments?.length ? (
                    <ul className="space-y-1">
                      {task.attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1"
                        >
                          <button
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:underline"
                            onClick={() =>
                              void run(async () => {
                                if (storageDevice) {
                                  const url = await taskAttachmentUrl(storageDevice, attachment);
                                  if (attachment.type === "image")
                                    setPreview({
                                      images: [{ src: url, name: attachment.name }],
                                      index: 0,
                                    });
                                  else {
                                    const link = document.createElement("a");
                                    link.href = url;
                                    link.download = attachment.name;
                                    link.click();
                                  }
                                }
                              })
                            }
                          >
                            {storageDevice && attachment.type === "image" ? (
                              <TaskImage environmentId={storageDevice} attachment={attachment} />
                            ) : (
                              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{attachment.name}</span>
                          </button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Remove ${attachment.name}`}
                            onClick={() =>
                              change({
                                attachments:
                                  task.attachments?.filter((file) => file.id !== attachment.id) ??
                                  [],
                              })
                            }
                          >
                            <XIcon className="size-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            </div>
            <div
              hidden={inline && section !== "prepare"}
              className={
                inline
                  ? "grid grid-cols-2 items-start gap-3 [&>section:last-child]:-order-1"
                  : "space-y-3"
              }
            >
              {(inline || task.brief || briefOpen) && (
                <section className="space-y-2 rounded-lg border border-border/60 p-3">
                  <label className="grid gap-2 text-xs font-medium">
                    Prepared context
                    <Textarea
                      aria-label="Handoff brief"
                      value={task.brief}
                      maxLength={32000}
                      className={
                        inline
                          ? "[&_textarea]:h-20 [&_textarea]:min-h-0 [&_textarea]:resize-none [&_textarea]:text-xs"
                          : "[&_textarea]:min-h-24 [&_textarea]:max-h-48 [&_textarea]:font-normal"
                      }
                      onChange={(event) => change({ brief: event.target.value })}
                    />
                  </label>
                </section>
              )}
              {!inline && !task.brief && !briefOpen && (
                <Button size="xs" variant="ghost" onClick={() => setBriefOpen(true)}>
                  Write context yourself
                </Button>
              )}
              <section className="rounded-lg border border-border/60">
                <Button
                  size="sm"
                  variant="ghost"
                  className={inline ? "hidden" : "w-full justify-between px-3"}
                  aria-expanded={preparationOpen}
                  onClick={() => setPreparationOpen(!preparationOpen)}
                >
                  <span className="flex items-center gap-2">
                    <MessageSquareIcon className="size-3.5" />
                    Gather context from a chat
                  </span>
                  <ChevronDownIcon
                    className={preparationOpen ? "size-3.5 rotate-180" : "size-3.5"}
                  />
                </Button>
                {(inline || preparationOpen) && (
                  <div
                    className={inline ? "space-y-2 p-2" : "space-y-3 border-t border-border/50 p-3"}
                  >
                    <p className={inline ? "hidden" : "text-xs text-muted-foreground"}>
                      Optional. Ask a chat that knows the background to prepare context for this
                      task.
                    </p>
                    <TaskSelect
                      label="Chat with background"
                      ariaLabel="Preparation chat"
                      value={
                        task.preparationThreadId !== undefined
                          ? (task.preparationThreadId ?? "")
                          : task.source?.environmentId === storageDevice
                            ? task.source.threadId
                            : ""
                      }
                      onChange={(value) =>
                        change({ preparationThreadId: value ? ThreadId.make(value) : null })
                      }
                      options={[
                        { value: "", label: "Choose a chat" },
                        ...threads
                          .filter(
                            (thread) =>
                              thread.environmentId === storageDevice && !thread.archivedAt,
                          )
                          .map((thread) => ({ value: thread.id, label: thread.title })),
                      ]}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size={inline ? "xs" : "sm"}
                        variant="outline"
                        disabled={
                          task.preparation?.state === "running" ||
                          !storageConnected ||
                          !(task.preparationThreadId !== undefined
                            ? task.preparationThreadId
                            : task.source?.environmentId === storageDevice
                              ? task.source.threadId
                              : null)
                        }
                        onClick={() =>
                          void run(async () => {
                            await persist({
                              ...task,
                              preparation:
                                task.preparation?.state === "queued"
                                  ? null
                                  : { requestedAt: new Date().toISOString(), state: "queued" },
                            });
                          })
                        }
                      >
                        {task.preparation?.state === "queued"
                          ? "Cancel preparation"
                          : task.preparation?.state === "running"
                            ? "Preparing context..."
                            : "Prepare context"}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        Starts a preparation turn, without implementing the task.
                      </span>
                    </div>
                    {task.preparation && (
                      <p role="status" className="text-xs text-muted-foreground">
                        {task.preparation.state === "queued"
                          ? "Waiting for the current turn to finish."
                          : task.preparation.state === "running"
                            ? "Preparing in the selected chat. The brief will appear here."
                            : task.preparation.error}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
            <div hidden={inline && section !== "chat"}>
              {destinationOpen && (
                <section
                  className={
                    inline
                      ? "grid grid-cols-3 items-start gap-x-3 gap-y-2 [&>p]:col-span-2 [&>p]:text-[11px]"
                      : "space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3"
                  }
                  aria-label="Task destination"
                  ref={destinationPanel}
                >
                  <div className={inline ? "hidden" : "flex items-center justify-between"}>
                    <h3 className="text-sm font-medium">Take this up</h3>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Close destination"
                      onClick={() => {
                        setDestinationOpen(false);
                        if (inline) setSection("context");
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  <div
                    className={
                      inline
                        ? "col-span-3 flex w-fit gap-1 rounded-md bg-muted p-0.5"
                        : "flex gap-1 rounded-lg bg-muted p-1"
                    }
                    role="group"
                    aria-label="Destination type"
                  >
                    {(["new", "existing"] as const).map((kind) => (
                      <Button
                        key={kind}
                        size={inline ? "xs" : "sm"}
                        variant={destinationKind === kind ? "secondary" : "ghost"}
                        className={inline ? "px-2" : "flex-1"}
                        aria-pressed={destinationKind === kind}
                        onClick={() => {
                          setDestinationKind(kind);
                          if (kind === "new") setNextThreadId(ThreadId.make(randomUUID()));
                          change({ threadId: null, chats: associated });
                        }}
                      >
                        {kind === "new" ? "New chat" : "Existing chat"}
                      </Button>
                    ))}
                  </div>
                  <div
                    className={
                      inline ? "col-span-2 grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3"
                    }
                  >
                    <TaskSelect
                      label="Device"
                      ariaLabel="Task device"
                      value={device ?? ""}
                      disabled={false}
                      onChange={(value) => {
                        setDevice(value ? EnvironmentId.make(value) : null);
                        change({ projectId: null, threadId: null, chats: associated });
                      }}
                      options={[
                        { value: "", label: "Choose later" },
                        ...environments.map((env) => ({
                          value: env.environmentId,
                          label: env.label,
                          detail: env.connection.phase !== "connected" ? "Offline" : undefined,
                        })),
                      ]}
                    />
                    <TaskSelect
                      label="Folder"
                      ariaLabel="Task folder"
                      value={project?.id ?? ""}
                      onChange={(value) =>
                        change({
                          projectId: value ? ProjectId.make(value) : null,
                          threadId: null,
                          chats: associated,
                        })
                      }
                      options={[
                        { value: "", label: "Choose later" },
                        ...folders.map((folder) => ({
                          value: folder.id,
                          label: folder.title,
                          detail: folder.workspaceRoot,
                        })),
                      ]}
                    />
                  </div>
                  {destinationKind === "existing" && (
                    <TaskSelect
                      label="Destination chat"
                      ariaLabel="Destination chat"
                      value={task.threadId ?? ""}
                      onChange={(value) =>
                        change({ threadId: value ? ThreadId.make(value) : null, chats: associated })
                      }
                      options={[
                        { value: "", label: "Choose a chat" },
                        ...threads
                          .filter(
                            (thread) =>
                              thread.environmentId === device &&
                              thread.projectId === project?.id &&
                              !thread.archivedAt,
                          )
                          .map((thread) => ({ value: thread.id, label: thread.title })),
                      ]}
                    />
                  )}
                  {device && !folders.length && (
                    <p className="text-xs text-muted-foreground">
                      {task.spaceId
                        ? "No folders are attached to this Space on this device. Add one using the Space tile's plus, or choose another device."
                        : "No folders are available here on this device. Add a folder or choose another device."}
                    </p>
                  )}
                  {task.projectId && !project && folders.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      The previous folder is outside this task's Space. Choose an available folder
                      before continuing.
                    </p>
                  )}
                  {project && (
                    <p
                      className={
                        inline
                          ? "col-span-2 truncate font-mono text-[10px] text-muted-foreground"
                          : "break-all font-mono text-[11px] text-muted-foreground"
                      }
                    >
                      {project.workspaceRoot}
                    </p>
                  )}
                  {destinationKind === "new" && (
                    <label
                      className={
                        inline
                          ? "flex items-center gap-2 self-end py-2 text-[11px]"
                          : "flex items-center gap-2 text-xs"
                      }
                    >
                      <Checkbox checked={separate} onCheckedChange={setSeparate} />
                      Separate worktree
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Your request{task.brief ? ", prepared context" : ""}
                    {task.attachments?.length
                      ? ` and ${task.attachments.length} attachment${task.attachments.length === 1 ? "" : "s"}`
                      : ""}{" "}
                    will be placed in the composer. Review and send there.
                  </p>
                  <Button
                    size={inline ? "xs" : "sm"}
                    disabled={
                      !task.title.trim() ||
                      !project ||
                      !connected ||
                      (destinationKind === "existing" && !task.threadId)
                    }
                    onClick={() => void run(openChat)}
                  >
                    Review in chat
                  </Button>
                </section>
              )}
            </div>
            <div
              hidden={inline && section !== "more"}
              className={inline ? "grid grid-cols-2 items-start gap-3" : "space-y-3"}
            >
              {(task.handoffs?.some((handoff) => handoff.sentAt) || associated.length > 0) && (
                <details
                  className="rounded-lg border border-border/60"
                  open={task.status === "working" || task.status === "done"}
                >
                  <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium">
                    Task history
                  </summary>
                  <div className="space-y-2 border-t border-border/50 p-3">
                    {(task.handoffs ?? [])
                      .filter((handoff) => handoff.sentAt)
                      .map((handoff) => (
                        <div key={handoff.messageId} className="flex items-start gap-2 text-xs">
                          <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <button
                              className="max-w-full truncate text-left font-medium hover:underline"
                              onClick={() =>
                                void run(async () => {
                                  const hash = assistantMessageHash(handoff.messageId);
                                  if (
                                    !(await openInColumns({
                                      environmentId: handoff.environmentId,
                                      id: handoff.threadId,
                                      hash,
                                    }))
                                  )
                                    await navigate({
                                      to: "/$environmentId/$threadId",
                                      params: handoff,
                                      hash,
                                    });
                                  close();
                                })
                              }
                            >
                              {threads.find(
                                (thread) =>
                                  thread.environmentId === handoff.environmentId &&
                                  thread.id === handoff.threadId,
                              )?.title ?? "Open handoff"}
                            </button>
                            {handoff.resultMessageId && (
                              <button
                                className="ml-2 text-primary hover:underline"
                                onClick={() =>
                                  void run(async () => {
                                    const hash = assistantMessageHash(handoff.resultMessageId!);
                                    if (
                                      !(await openInColumns({
                                        environmentId: handoff.environmentId,
                                        id: handoff.threadId,
                                        hash,
                                      }))
                                    )
                                      await navigate({
                                        to: "/$environmentId/$threadId",
                                        params: handoff,
                                        hash,
                                      });
                                    close();
                                  })
                                }
                              >
                                View result
                              </button>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              Sent {new Date(handoff.sentAt!).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    {!task.handoffs?.some((handoff) => handoff.sentAt) && (
                      <p className="text-xs text-muted-foreground">
                        A chat was linked earlier. No tracked handoff has been sent.
                      </p>
                    )}
                    {associated
                      .filter(
                        (chat) =>
                          !task.handoffs?.some(
                            (handoff) =>
                              handoff.sentAt &&
                              handoff.threadId === chat.threadId &&
                              handoff.environmentId === chat.environmentId,
                          ),
                      )
                      .map((chat) => (
                        <Button
                          key={`${chat.environmentId}:${chat.threadId}`}
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            void run(async () => {
                              if (
                                !(await openInColumns({
                                  environmentId: chat.environmentId,
                                  id: chat.threadId,
                                }))
                              )
                                await navigate({ to: "/$environmentId/$threadId", params: chat });
                              close();
                            })
                          }
                        >
                          {threads.find(
                            (thread) =>
                              thread.environmentId === chat.environmentId &&
                              thread.id === chat.threadId,
                          )?.title ?? "Linked chat"}
                        </Button>
                      ))}
                    {task.status === "working" && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setDestinationOpen(true);
                          setDestinationKind("new");
                          setNextThreadId(ThreadId.make(randomUUID()));
                          change({ chats: associated, threadId: null });
                        }}
                      >
                        Continue in another chat
                      </Button>
                    )}
                    {associated
                      .filter((chat) => chat.result)
                      .map((chat) => (
                        <p
                          key={`result-${chat.environmentId}-${chat.threadId}`}
                          className="whitespace-pre-wrap text-xs text-muted-foreground"
                        >
                          {chat.result}
                        </p>
                      ))}
                    {task.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        Completed {new Date(task.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </details>
              )}
              <details open={inline || undefined} className="rounded-lg border border-border/60">
                <summary
                  className={
                    inline ? "hidden" : "cursor-pointer px-3 py-2.5 text-xs text-muted-foreground"
                  }
                >
                  Reminder and other actions
                </summary>
                <div
                  className={
                    inline
                      ? "flex flex-wrap items-start gap-2 p-2 [&>label]:w-full"
                      : "space-y-3 border-t border-border/50 p-3"
                  }
                >
                  <label className="grid gap-1.5 text-xs text-muted-foreground">
                    Remind me
                    <Input
                      nativeInput
                      type="datetime-local"
                      aria-label="Task reminder"
                      value={
                        task.remindAt
                          ? new Date(
                              Date.parse(task.remindAt) -
                                new Date(task.remindAt).getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16)
                          : ""
                      }
                      onChange={(event) =>
                        change({
                          remindAt: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                    {task.remindAt && (
                      <Button size="xs" variant="ghost" onClick={() => change({ remindAt: null })}>
                        Clear reminder
                      </Button>
                    )}
                    Reminders appear in T3 while it is open, or when you return.
                  </label>
                  {task.status !== "parked" && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          await persist(returnWorkItemToPlanned(task, new Date().toISOString()));
                          setDraft(null);
                          close();
                        })
                      }
                    >
                      Return to planned
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      void run(async () => {
                        await persist({
                          ...task,
                          deletedAt: task.deletedAt ? null : new Date().toISOString(),
                          preparation: null,
                        });
                        setDraft(null);
                        close();
                      })
                    }
                  >
                    {task.deletedAt ? "Restore task" : "Move to Trash"}
                  </Button>
                </div>
              </details>
            </div>
            {!storageConnected && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reconnect the task storage device to save changes. Your draft stays here.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
              >
                {error}
              </p>
            )}
          </fieldset>
        </div>
        {(!inline || task.status === "working" || task.status === "done") && (
          <Footer
            className={
              inline
                ? "flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-2"
                : "shrink-0 flex-row items-center justify-between gap-3 px-5 py-3 sm:justify-between"
            }
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              className={inline ? "hidden" : "text-muted-foreground"}
              onClick={() => {
                close();
              }}
            >
              Close
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {!Equal.equals(task, base) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !task.title.trim() || !storageConnected}
                  onClick={() =>
                    void run(async () => {
                      await persist();
                      setDraft(null);
                    })
                  }
                >
                  Save changes
                </Button>
              )}
              {!task.deletedAt &&
                (task.status === "working" ? (
                  <Button
                    size="sm"
                    disabled={busy || !storageConnected}
                    onClick={() =>
                      void run(async () => {
                        await persist({
                          ...task,
                          status: "done",
                          completedAt: new Date().toISOString(),
                          preparation: null,
                          remindAt: null,
                        });
                        setDraft(null);
                        close();
                      })
                    }
                  >
                    Complete task
                  </Button>
                ) : task.status === "done" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !storageConnected}
                    onClick={() =>
                      void run(async () => {
                        await persist(returnWorkItemToPlanned(task, new Date().toISOString()));
                        setDraft(null);
                        close();
                      })
                    }
                  >
                    Return to planned
                  </Button>
                ) : (
                  !inline &&
                  !destinationOpen && (
                    <Button
                      size="sm"
                      disabled={busy || !!task.deletedAt || !storageConnected}
                      onClick={() => {
                        setDestinationOpen(true);
                        if (inline) setSection("chat");
                      }}
                    >
                      Take this up
                    </Button>
                  )
                ))}
            </div>
          </Footer>
        )}
      </Popup>
      {preview && <ExpandedImageDialog preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
  return inline ? (
    content
  ) : (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      {content}
    </Dialog>
  );
}

function TaskImage({
  environmentId,
  attachment,
}: {
  environmentId: EnvironmentId;
  attachment: ChatAttachment;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void taskAttachmentUrl(environmentId, attachment)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [environmentId, attachment]);
  return url ? (
    <img
      src={url}
      alt="Screenshot attachment"
      className="size-10 shrink-0 rounded border border-border/50 object-cover"
    />
  ) : (
    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
  );
}
