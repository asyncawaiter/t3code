import { cn, randomUUID } from "../../lib/utils";
import {
  CommandId,
  MessageId,
  resolveLatestMessageRewind,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type OrchestrationMessage,
  type OrchestrationThread,
  type EnvironmentId,
} from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";
import { FileIcon, PaperclipIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { assetEnvironment } from "../../state/assets";
import { threadEnvironment } from "../../state/threads";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { useAtomCommand } from "../../state/use-atom-command";
import { readPreparedConnection } from "../../state/session";
import {
  startAttachmentUpload,
  readAttachmentUpload,
  retryAttachmentUpload,
  awaitAttachmentUploads,
  getUploadedAttachments,
  releaseDraftAttachments,
} from "../../lib/attachmentUploadQueue";
import type { ComposerFileAttachment, ComposerImageAttachment } from "../../composerDraftStore";
import { prepareImageForAttachment } from "../../lib/imageCompression";
import {
  classifyComposerAttachmentFile,
  normalizeComposerImageFileMimeType,
} from "./composerAttachmentFiles";

type EditAttachment = ComposerImageAttachment | ComposerFileAttachment;

function release(items: EditAttachment[]) {
  releaseDraftAttachments(items);
  for (const item of items) if (item.type === "image") URL.revokeObjectURL(item.previewUrl);
}

export function EditMessageDialog({
  message,
  thread,
  environmentId,
  connected,
  supported,
  maxFileBytes,
  hasComposerDraft,
  onClose,
  onRecoverDraft,
}: {
  message: OrchestrationMessage;
  thread: OrchestrationThread;
  environmentId: EnvironmentId;
  connected: boolean;
  supported: boolean;
  maxFileBytes: number;
  hasComposerDraft: boolean;
  onClose: () => void;
  onRecoverDraft: (text: string, attachments: EditAttachment[]) => void;
}) {
  const [text, setText] = useState(message.text);
  const [attachments, setAttachments] = useState<EditAttachment[]>([]);
  const [restoreFiles, setRestoreFiles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recovered, setRecovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const owned = useRef<EditAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    reportFailure: false,
    refresh: true,
  });
  const rewind = useAtomCommand(threadEnvironment.revertCheckpoint, { reportFailure: false });
  const target = resolveLatestMessageRewind(thread, message.id);
  const blocked = !connected
    ? "Reconnect this device to edit the message."
    : !supported
      ? "Editing is available for Codex and Claude. This provider is not supported yet."
      : "error" in target
        ? target.error
        : null;

  useEffect(() => {
    // The retry counter explicitly starts a fresh attachment recovery attempt.
    void loadAttempt;
    const abort = new AbortController();
    const loaded: EditAttachment[] = [];
    void (async () => {
      try {
        const connection = readPreparedConnection(environmentId);
        if (!connection) throw new Error("Reconnect this device to recover attachments.");
        for (const attachment of message.attachments ?? []) {
          if (attachment.type !== "image" && attachment.type !== "file")
            throw new Error(
              `Attachment '${attachment.name}' is unsupported. It has not been removed.`,
            );
          const result = await createUrl({
            environmentId,
            input: { resource: { _tag: "attachment", attachmentId: attachment.id } },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          const url = resolveAssetUrl(connection.httpBaseUrl, result.value.relativeUrl);
          if (!url) throw new Error(`Cannot load '${attachment.name}'.`);
          const response = await fetch(url, { signal: abort.signal });
          if (!response.ok) throw new Error(`Cannot load '${attachment.name}'. Please retry.`);
          const blob = await response.blob();
          if (blob.size !== attachment.sizeBytes)
            throw new Error(`'${attachment.name}' was not recovered completely. Please retry.`);
          const file = new File([blob], attachment.name, { type: attachment.mimeType });
          const item = { ...attachment, id: randomUUID(), file };
          loaded.push(
            attachment.type === "image"
              ? { ...item, type: "image", previewUrl: URL.createObjectURL(file) }
              : { ...item, type: "file" },
          );
        }
        if (abort.signal.aborted) {
          release(loaded);
          return;
        }
        owned.current = loaded;
        setAttachments(loaded);
        setRecovered(true);
      } catch (cause) {
        release(loaded);
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not recover every attachment. Please retry.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [createUrl, environmentId, message, loadAttempt]);

  useEffect(() => () => release(owned.current), []);

  async function addFiles(files: File[]) {
    setError(null);
    const added: EditAttachment[] = [];
    setAdding(true);
    try {
      if (attachments.length + files.length > PROVIDER_SEND_TURN_MAX_ATTACHMENTS)
        throw new Error(`Keep at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} attachments.`);
      for (let file of files) {
        const kind = classifyComposerAttachmentFile(file);
        if (kind === "unsupported-image")
          throw new Error(`'${file.name}' is not a supported image.`);
        if (kind === "image") {
          const prepared = await prepareImageForAttachment(
            normalizeComposerImageFileMimeType(file),
            PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
          );
          if (!prepared.ok) throw new Error(`Could not prepare '${file.name}'.`);
          file = prepared.file;
        } else if (!file.size || file.size > maxFileBytes)
          throw new Error(`'${file.name}' exceeds this device's file attachment limit.`);
        const base = {
          id: randomUUID(),
          file,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        };
        added.push(
          kind === "image"
            ? { ...base, type: "image", previewUrl: URL.createObjectURL(file) }
            : { ...base, type: "file" },
        );
      }
      owned.current = [...attachments, ...added];
      setAttachments(owned.current);
    } catch (cause) {
      release(added);
      setError(cause instanceof Error ? cause.message : "Could not add attachments.");
    } finally {
      setAdding(false);
    }
  }

  async function submit(resend: boolean) {
    if (blocked || busy || adding || loading || "error" in target) return;
    setBusy(true);
    setError(null);
    try {
      for (const image of attachments) {
        const upload = { environmentId, image };
        if (readAttachmentUpload(image.id)?.status === "failed") retryAttachmentUpload(upload);
        else startAttachmentUpload(upload);
      }
      await awaitAttachmentUploads(attachments.map((attachment) => attachment.id));
      const uploaded = getUploadedAttachments({ environmentId, images: attachments });
      if (!uploaded)
        throw new Error("Some attachments could not upload. Retry without removing them.");
      setSubmitted(true);
      const result = await rewind({
        environmentId,
        input: {
          commandId: CommandId.make(randomUUID()),
          threadId: thread.id,
          turnCount: target.turnCount,
          edit: {
            sourceMessageId: message.id,
            restoreFiles,
            ...(resend
              ? {
                  replacement: {
                    messageId: MessageId.make(randomUUID()),
                    text,
                    attachments: uploaded,
                  },
                }
              : {}),
          },
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      if (!resend) {
        const retained = attachments.map((attachment, index) =>
          attachment.type === "file"
            ? {
                ...attachment,
                uploadedAttachmentId: uploaded[index]!.id,
                uploadEnvironmentId: environmentId,
              }
            : attachment,
        );
        onRecoverDraft(text, retained);
        owned.current = [];
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The edit failed. Your text and attachments are still here.",
      );
    } finally {
      setBusy(false);
    }
  }

  const originalCount = message.attachments?.length ?? 0;
  // Recovery errors cannot silently turn an attachment-bearing prompt into text only.
  const canSubmit = !blocked && !busy && !adding && !loading && recovered && !submitted;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !adding) onClose();
      }}
    >
      <DialogPopup
        className="w-[min(34rem,calc(100vw-2rem))] max-w-none"
        showCloseButton={!busy && !adding}
      >
        <DialogHeader className="gap-1 px-5 pt-5">
          <DialogTitle className="text-base">Edit message</DialogTitle>
          <DialogDescription className="text-xs">
            Replace your latest prompt and its response.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 px-5 pb-4">
          {blocked ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {blocked}
            </p>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring/60">
            <textarea
              aria-label="Edit message"
              className="block min-h-28 max-h-64 w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none"
              value={text}
              maxLength={PROVIDER_SEND_TURN_MAX_INPUT_CHARS}
              onChange={(event) => setText(event.target.value)}
              disabled={busy || adding}
            />
            {loading ? (
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                Recovering {originalCount} attachments...
              </p>
            ) : null}
            <div className={cn("flex flex-wrap gap-1.5 px-3", attachments.length > 0 && "pb-2")}>
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex max-w-52 items-center gap-2 rounded-md border border-border p-1.5 text-xs"
                >
                  {attachment.type === "image" ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.name}
                      className="size-9 rounded object-cover"
                    />
                  ) : (
                    <FileIcon className="size-4 shrink-0" />
                  )}
                  <Tooltip>
                    <TooltipTrigger render={<span className="truncate" />}>
                      {attachment.name}
                    </TooltipTrigger>
                    <TooltipPopup>{attachment.name}</TooltipPopup>
                  </Tooltip>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Remove ${attachment.name}`}
                    disabled={busy || adding}
                    onClick={() => {
                      release([attachment]);
                      owned.current = attachments.filter((item) => item.id !== attachment.id);
                      setAttachments(owned.current);
                    }}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-2 py-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || adding || loading || !recovered}
                onClick={() => fileInput.current?.click()}
              >
                <PaperclipIcon className="size-3" />
                Add attachments
              </Button>
              <span className="pr-1 text-[11px] text-muted-foreground">
                {attachments.length}/{PROVIDER_SEND_TURN_MAX_ATTACHMENTS}
              </span>
            </div>
          </div>
          <fieldset disabled={busy || adding || !!blocked} className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-medium">Workspace files</legend>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map((restore) => (
                <label
                  key={String(restore)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                    restoreFiles === restore ? "border-foreground/25 bg-muted/50" : "border-border",
                    restore && ("error" in target || !target.canRestoreFiles) && "opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="edit-file-behavior"
                    checked={restoreFiles === restore}
                    disabled={restore && ("error" in target || !target.canRestoreFiles)}
                    onChange={() => setRestoreFiles(restore)}
                    className="accent-current"
                  />
                  {restore ? "Restore files" : "Keep current files"}
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {restoreFiles
                ? "Restore the checkpoint before this message, including replacing newer file changes."
                : "Only the conversation rewinds. Your current files stay as they are."}
              {!("error" in target) && !target.canRestoreFiles
                ? " No file checkpoint is available."
                : ""}
            </p>
          </fieldset>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {error}
              {!loading && !recovered && originalCount > 0 ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setLoading(true);
                    setRecovered(false);
                    setError(null);
                    setLoadAttempt((value) => value + 1);
                  }}
                >
                  Retry attachments
                </Button>
              ) : null}
            </div>
          ) : null}
          {submitted && error ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Check the chat before trying again. Your edited prompt is still here.</span>
              <Button
                size="xs"
                variant="outline"
                disabled={busy || hasComposerDraft}
                onClick={() => {
                  // A timed-out resend may already have claimed these uploads.
                  // Keep the local files, but upload fresh copies on the next send.
                  releaseDraftAttachments(attachments);
                  onRecoverDraft(
                    text,
                    attachments.map((attachment) => ({
                      ...attachment,
                      id: randomUUID(),
                    })),
                  );
                  owned.current = [];
                  onClose();
                }}
              >
                Keep as draft
              </Button>
            </div>
          ) : null}
          {hasComposerDraft ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Your current draft is preserved. Clear it before rewinding without resending.
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter className="gap-2 px-5 py-3">
          <Button size="sm" variant="ghost" disabled={busy || adding} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canSubmit || hasComposerDraft}
            className="sm:mr-auto sm:order-first"
            onClick={() => void submit(false)}
          >
            Rewind only
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit || (!text.trim() && !attachments.length)}
            onClick={() => void submit(true)}
          >
            {busy ? "Applying..." : "Save & resend"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
