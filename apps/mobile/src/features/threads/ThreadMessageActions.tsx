import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Modal, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  CommandId,
  MessageId,
  ThreadId,
  resolveLatestMessageRewind,
  profileForProject,
  spaceForThread,
  moveThreadsToSpace,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type EnvironmentId,
  type OrchestrationThread,
  type OrchestrationMessage,
  type ServerConfig,
  type ChatAttachment,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import * as Option from "effect/Option";
import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { uuidv4 } from "../../lib/uuid";
import { downloadAttachmentForPreview } from "../../lib/attachmentDownload";
import { prepareTurnAttachments, validateDraftFileAttachments } from "../../lib/attachmentUpload";
import {
  persistComposerAttachmentFile,
  pickComposerFiles,
  pickComposerMedia,
  type DraftComposerAttachment,
} from "../../lib/composerImages";
import { assetEnvironment } from "../../state/assets";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentSession } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { useProfiles, useSaveProfiles } from "../../state/profiles";
import {
  getComposerDraftSnapshot,
  isComposerDraftEmpty,
  replaceComposerDraftAttachments,
  scheduleUnusedComposerAttachmentCleanup,
  setComposerDraftText,
} from "../../state/use-composer-drafts";

const ActionsContext = createContext<{
  editId: MessageId | null;
  edit: (message: OrchestrationMessage) => void;
  fork: (message: OrchestrationMessage) => void;
  busy: boolean;
} | null>(null);

export function MessageActions({ message }: { message: OrchestrationMessage }) {
  const actions = useContext(ActionsContext);
  if (!actions || message.streaming || (message.role === "user" && actions.editId !== message.id))
    return null;
  const edit = message.role === "user";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={edit ? "Edit message" : "Fork chat here"}
      disabled={actions.busy}
      onPress={() => (edit ? actions.edit(message) : actions.fork(message))}
      className="size-11 items-center justify-center"
    >
      <SymbolView
        name={edit ? "pencil" : "arrow.triangle.branch"}
        size={15}
        tintColorClassName="accent-icon-muted"
      />
    </Pressable>
  );
}

export function ThreadMessageActionsProvider(props: {
  thread: OrchestrationThread | null;
  environmentId: EnvironmentId;
  serverConfig: ServerConfig | null;
  connected: boolean;
  children: ReactNode;
}) {
  const navigation = useNavigation();
  const fork = useAtomCommand(orchestrationEnvironment.forkThread, { reportFailure: false });
  const source = useProfiles();
  const save = useSaveProfiles();
  const [editing, setEditing] = useState<OrchestrationMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const thread = props.thread;
  const provider = props.serverConfig?.providers.find(
    (entry) =>
      entry.instanceId ===
      (thread?.session?.providerInstanceId ?? thread?.modelSelection.instanceId),
  );
  const latest = thread?.messages.findLast((message) => message.role === "user");
  const profiles = source.profiles;
  const sourceId = thread?.id;
  const sourceProjectId = thread?.projectId;
  const sourceTitle = thread?.title;
  const sourceModel = thread?.modelSelection;
  const sourceRuntime = thread?.runtimeMode;
  const sourceInteraction = thread?.interactionMode;
  const forkSource = useMemo(
    () =>
      sourceId &&
      sourceProjectId &&
      sourceTitle !== undefined &&
      sourceModel &&
      sourceRuntime &&
      sourceInteraction
        ? {
            id: sourceId,
            projectId: sourceProjectId,
            title: sourceTitle,
            modelSelection: sourceModel,
            runtimeMode: sourceRuntime,
            interactionMode: sourceInteraction,
          }
        : null,
    [sourceId, sourceProjectId, sourceTitle, sourceModel, sourceRuntime, sourceInteraction],
  );
  const forkMessage = useCallback(
    async (message: OrchestrationMessage) => {
      const thread = forkSource;
      if (!thread || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      const childId = ThreadId.make(uuidv4());
      try {
        const result = await fork({
          environmentId: props.environmentId,
          input: {
            threadId: childId,
            sourceThreadId: thread.id,
            sourceMessageId: message.id,
            title: thread.title,
            modelSelection: thread.modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            createdAt: new Date().toISOString(),
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        const projectKey = `${props.environmentId}:${thread.projectId}`;
        const parent = profileForProject(profiles, projectKey);
        const space =
          parent && spaceForThread(parent, `${props.environmentId}:${thread.id}`, projectKey);
        if (space) {
          try {
            await save((profiles) => {
              const current = profileForProject(profiles, projectKey);
              if (
                current?.id !== parent.id ||
                !current.spaces?.some((item) => item.id === space.id)
              )
                throw new Error("The source chat's space changed.");
              return profiles.map((item) =>
                item.id === parent.id
                  ? moveThreadsToSpace(
                      item,
                      [{ threadKey: `${props.environmentId}:${childId}`, projectKey }],
                      space.id,
                    )
                  : item,
              );
            });
          } catch {
            Alert.alert(
              "Chat forked",
              "The shared profile source is unavailable or the space changed. Your fork is available outside spaces; move it when the source reconnects.",
            );
          }
        }
        navigation.navigate("Thread", { environmentId: props.environmentId, threadId: childId });
      } catch (error) {
        Alert.alert(
          "Could not fork chat",
          error instanceof Error ? error.message : "Please retry.",
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [forkSource, fork, profiles, save, navigation, props.environmentId],
  );
  const editId =
    provider?.supportsMessageEditing && props.serverConfig?.environment.capabilities.messageEditing
      ? (latest?.id ?? null)
      : null;
  const context = useMemo(
    () =>
      props.connected && sourceId
        ? {
            editId,
            edit: setEditing,
            fork: (message: OrchestrationMessage) => void forkMessage(message),
            busy,
          }
        : null,
    [props.connected, sourceId, editId, forkMessage, busy],
  );
  return (
    <ActionsContext.Provider value={context}>
      {props.children}
      {editing && thread && (
        <EditMessageSheet
          key={editing.id}
          message={editing}
          thread={thread}
          environmentId={props.environmentId}
          serverConfig={props.serverConfig}
          connected={props.connected}
          onClose={() => setEditing(null)}
        />
      )}
    </ActionsContext.Provider>
  );
}

function EditMessageSheet(props: {
  message: OrchestrationMessage;
  thread: OrchestrationThread;
  environmentId: EnvironmentId;
  serverConfig: ServerConfig | null;
  connected: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState(props.message.text);
  const [attachments, setAttachments] = useState<ReadonlyArray<DraftComposerAttachment>>([]);
  const owned = useRef<ReadonlyArray<DraftComposerAttachment>>([]);
  const [loading, setLoading] = useState(true);
  const [recovered, setRecovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [submitted, setSubmitted] = useState(false);
  const [restoreFiles, setRestoreFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    refresh: true,
    reportFailure: false,
  });
  const rewind = useAtomCommand(threadEnvironment.revertCheckpoint, { reportFailure: false });
  const target = resolveLatestMessageRewind(props.thread, props.message.id);
  const blocked = !props.connected
    ? "Reconnect this device before editing."
    : "error" in target
      ? target.error
      : null;
  const draftKey = `${props.environmentId}:${props.thread.id}`;
  const hasDraft = !isComposerDraftEmpty(getComposerDraftSnapshot(draftKey));
  useEffect(() => {
    const abort = new AbortController();
    const loaded: DraftComposerAttachment[] = [];
    void (async () => {
      try {
        const { File } = await import("expo-file-system");
        for (const attachment of props.message.attachments ?? []) {
          if (attachment.type !== "file" && attachment.type !== "image")
            throw new Error(`Cannot recover '${attachment.name}'. It has not been removed.`);
          const connection = appAtomRegistry.get(
            environmentSession.preparedConnectionValueAtom(props.environmentId),
          );
          if (Option.isNone(connection)) throw new Error("Reconnect to recover attachments.");
          const result = await createUrl({
            environmentId: props.environmentId,
            input: { resource: { _tag: "attachment", attachmentId: attachment.id } },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          const url = resolveAssetUrl(connection.value.httpBaseUrl, result.value.relativeUrl);
          if (!url) throw new Error(`Cannot load '${attachment.name}'.`);
          const preview = await downloadAttachmentForPreview({
            url,
            attachment,
            signal: abort.signal,
          });
          if (!preview) {
            scheduleUnusedComposerAttachmentCleanup(loaded);
            return;
          }
          try {
            const file = new File(preview.uri);
            if (file.size !== attachment.sizeBytes)
              throw new Error(`'${attachment.name}' was not fully recovered. Retry.`);
            const id = uuidv4();
            if (attachment.type === "file")
              loaded.push({
                ...attachment,
                type: "file",
                id,
                fileUri: await persistComposerAttachmentFile(
                  preview.uri,
                  attachment.name,
                  attachment.sizeBytes,
                ),
              });
            else {
              const dataUrl = `data:${attachment.mimeType};base64,${await file.base64()}`;
              loaded.push({ ...attachment, type: "image", id, dataUrl, previewUri: dataUrl });
            }
          } finally {
            preview.dispose();
          }
        }
        if (abort.signal.aborted) {
          scheduleUnusedComposerAttachmentCleanup(loaded);
          return;
        }
        owned.current = loaded;
        setAttachments(loaded);
        setRecovered(true);
      } catch (error) {
        scheduleUnusedComposerAttachmentCleanup(loaded);
        if (!abort.signal.aborted)
          setError(error instanceof Error ? error.message : "Attachment recovery failed.");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      abort.abort();
      scheduleUnusedComposerAttachmentCleanup(loaded);
    };
  }, [createUrl, props.environmentId, props.message, attempt]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scheduleUnusedComposerAttachmentCleanup(owned.current);
    };
  }, []);
  const add = async (media: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const maxBytes = props.serverConfig?.environment.capabilities.fileAttachments?.maxUploadBytes;
      const result = media
        ? await pickComposerMedia({
            existingCount: attachments.length,
            ...(maxBytes ? { maxVideoBytes: maxBytes } : {}),
          })
        : await pickComposerFiles({
            existingCount: attachments.length,
            ...(maxBytes ? { maxBytes } : {}),
          });
      const added = "files" in result ? result.files : result.attachments;
      if (!mounted.current) {
        scheduleUnusedComposerAttachmentCleanup(added);
        return;
      }
      owned.current = [...owned.current, ...added];
      setAttachments(owned.current);
      setError(result.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add attachments.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const keepDraft = () => {
    if (!isComposerDraftEmpty(getComposerDraftSnapshot(draftKey))) {
      setError("Your composer has a draft. Clear it before recovering this edit.");
      return false;
    }
    setComposerDraftText(draftKey, text);
    replaceComposerDraftAttachments(
      draftKey,
      owned.current.map(
        ({ uploadedAttachmentId: _id, uploadEnvironmentId: _env, ...attachment }) => attachment,
      ),
    );
    owned.current = [];
    return true;
  };
  const submit = async (resend: boolean) => {
    if (
      lock.current ||
      blocked ||
      !recovered ||
      submitted ||
      "error" in target ||
      (!resend && hasDraft)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const invalid = validateDraftFileAttachments({
        attachments,
        serverConfig: props.serverConfig,
      });
      if (invalid) throw new Error(invalid);
      const prepared = await prepareTurnAttachments({
        environmentId: props.environmentId,
        attachments,
        supportsImageUploads: true,
      });
      if (prepared.status !== "ready") throw new Error("Attachment upload was interrupted.");
      owned.current = prepared.draftAttachments;
      if (!mounted.current) {
        scheduleUnusedComposerAttachmentCleanup(owned.current);
        return;
      }
      const uploaded: ChatAttachment[] = [];
      for (const attachment of prepared.attachments) {
        if (!("id" in attachment))
          throw new Error("Update this host to support attachment uploads.");
        uploaded.push(attachment);
      }
      setSubmitted(true);
      const result = await rewind({
        environmentId: props.environmentId,
        input: {
          commandId: CommandId.make(uuidv4()),
          threadId: props.thread.id,
          turnCount: target.turnCount,
          edit: {
            sourceMessageId: props.message.id,
            restoreFiles,
            ...(resend
              ? {
                  replacement: { messageId: MessageId.make(uuidv4()), text, attachments: uploaded },
                }
              : {}),
          },
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      if (!resend && !keepDraft()) return;
      props.onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Edit failed. Your text and attachments remain here.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const canSubmit = !blocked && !busy && !loading && recovered && !submitted;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => !busy && props.onClose()}
    >
      <SafeAreaView className="flex-1 bg-sheet">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 16 }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-t3-semibold text-foreground">Edit message</Text>
            <Pressable
              disabled={busy}
              onPress={props.onClose}
              className="min-h-11 justify-center"
              accessibilityRole="button"
            >
              <Text className="text-foreground">Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Edit message"
            multiline
            maxLength={PROVIDER_SEND_TURN_MAX_INPUT_CHARS}
            editable={!busy}
            value={text}
            onChangeText={setText}
            className="min-h-40 rounded-xl bg-subtle p-3 text-base text-foreground"
            style={{ textAlignVertical: "top" }}
          />
          {loading && (
            <Text className="text-sm text-foreground-muted">Recovering attachments...</Text>
          )}
          {attachments.map((item) => (
            <View key={item.id} className="flex-row items-center gap-2">
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {item.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                disabled={busy}
                onPress={() => {
                  owned.current = owned.current.filter((entry) => entry.id !== item.id);
                  setAttachments(owned.current);
                  scheduleUnusedComposerAttachmentCleanup([item]);
                }}
                className="size-11 items-center justify-center"
              >
                <Text className="text-foreground">×</Text>
              </Pressable>
            </View>
          ))}
          <View className="flex-row gap-4">
            {[true, false].map((media) => (
              <Pressable
                key={String(media)}
                disabled={busy || !recovered}
                onPress={() => void add(media)}
                className="min-h-11 justify-center"
                accessibilityRole="button"
              >
                <Text className="text-sm text-foreground">
                  {media ? "Add photos" : "Add files"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-sm text-foreground">Restore workspace files</Text>
            <Switch
              accessibilityLabel="Restore workspace files"
              value={restoreFiles}
              onValueChange={setRestoreFiles}
              disabled={busy || "error" in target || !target.canRestoreFiles}
            />
          </View>
          <Text className="text-xs text-foreground-muted">
            {restoreFiles
              ? "Replaces newer file changes with the checkpoint before this message."
              : "Rewinds the conversation while keeping current files."}
          </Text>
          {(blocked || error) && (
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              {blocked ?? error}
            </Text>
          )}
          {!loading && !recovered && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoading(true);
                setError(null);
                setAttempt((value) => value + 1);
              }}
              className="min-h-11 justify-center"
            >
              <Text className="text-foreground">Retry attachments</Text>
            </Pressable>
          )}
          {hasDraft && (
            <Text className="text-xs text-foreground-muted">
              Your composer draft is preserved. Clear it before using Rewind only.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit || (!text.trim() && !attachments.length)}
            onPress={() => void submit(true)}
            className="min-h-12 items-center justify-center rounded-xl bg-foreground"
          >
            <Text className="font-t3-medium text-screen">
              {busy ? "Applying..." : "Save and resend"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit || hasDraft}
            onPress={() => void submit(false)}
            className="min-h-12 items-center justify-center rounded-xl bg-subtle"
          >
            <Text className="text-foreground">Rewind only</Text>
          </Pressable>
          {submitted && error && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || hasDraft}
              onPress={() => {
                if (keepDraft()) props.onClose();
              }}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm text-foreground">
                Keep as draft (check the chat before retrying)
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
