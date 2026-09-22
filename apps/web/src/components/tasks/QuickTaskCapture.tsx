import { useEffect, useRef, useState, type RefObject } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  AttachmentCreateUploadUrlInput,
  indexProfileSpaces,
  workItemTitle,
  type WorkItem,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { profileSourceAtom } from "../../state/server";
import { usePrimarySettings } from "../../hooks/useSettings";
import { useUiStateStore } from "../../uiStateStore";
import { randomUUID } from "../../lib/utils";
import { workItemDraftKey, type WorkItemRequest } from "../../workItems";
import {
  useTaskCaptures,
  withTaskCaptureLock,
  writeTaskCapture,
  readTaskCaptures,
  type TaskCapture,
} from "./taskCaptureStorage";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { PaperclipIcon, XIcon } from "lucide-react";
import { TaskSelect } from "./TaskSelect";
import { shouldHandleComposerAttachmentPaste } from "../chat/composerAttachmentFiles";

const validateUpload = Schema.decodeUnknownSync(AttachmentCreateUploadUrlInput);
export function QuickTaskCapture({
  request,
  onSaved,
  closeRef,
}: {
  request: WorkItemRequest;
  onSaved: () => void;
  closeRef?: RefObject<(() => Promise<boolean>) | null>;
}) {
  const source = useAtomValue(profileSourceAtom);
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const ui = useUiStateStore();
  const captures = useTaskCaptures((state) => state.captures);
  const draftKey = workItemDraftKey(request);
  const hasIncomingContent = !!(
    request.notes ||
    request.title ||
    request.files?.length ||
    request.attachments?.length
  );
  const previous = captures.find((capture) =>
    request.localCaptureId
      ? capture.id === request.localCaptureId
      : !hasIncomingContent && !capture.queued && capture.draftKey === draftKey,
  );
  const placement = request.source
    ? indexProfileSpaces(profiles).get(`${request.source.environmentId}:${request.source.threadId}`)
    : undefined;
  const [capture, setCapture] = useState<TaskCapture>(() => {
    if (previous) return previous;
    const now = new Date().toISOString();
    const id = randomUUID();
    const profileId =
      request.profileId !== undefined
        ? request.profileId === "all"
          ? null
          : request.profileId
        : (placement?.profile.id ?? ui.activeProfileId);
    const notes = request.notes ?? request.title ?? "";
    return {
      id,
      draftKey,
      environmentId: source.sourceId,
      ...(request.environmentId ? { attachmentEnvironmentId: request.environmentId } : {}),
      files: request.files ?? [],
      queued: false,
      item: {
        id,
        title: workItemTitle(notes, request.files?.length ?? request.attachments?.length),
        notes,
        brief: "",
        status: "parked",
        profileId: profileId === "all" ? null : profileId,
        spaceId: request.spaceId ?? placement?.space.id ?? null,
        projectId: null,
        executionEnvironmentId: null,
        threadId: null,
        source: request.source ?? null,
        attachments: request.attachments ?? [],
        links: [],
        createdAt: now,
        updatedAt: now,
      },
    };
  });
  const current = useRef(capture);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [preview, setPreview] = useState<File | null>(null);
  const profile = profiles.find((item) => item.id === capture.item.profileId);
  const hasContent =
    !!capture.item.notes.trim() || !!capture.files.length || !!capture.item.attachments?.length;
  async function store(next: TaskCapture) {
    current.current = next;
    setCapture(next);
    setError(null);
    await withTaskCaptureLock(() => writeTaskCapture(next), next.id);
  }
  function change(patch: Partial<WorkItem>) {
    const next = {
      ...current.current,
      item: { ...current.current.item, ...patch, updatedAt: new Date().toISOString() },
    };
    void store(next).catch((cause) => setError(`Not saved locally: ${String(cause)}`));
  }
  async function addFiles(files: File[]) {
    try {
      if (
        current.current.files.length +
          (current.current.item.attachments?.length ?? 0) +
          files.length >
        8
      )
        throw new Error("Attach up to 8 files.");
      for (const file of files)
        validateUpload({
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : "file",
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
      await store({ ...current.current, files: [...current.current.files, ...files] });
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function save() {
    if (!hasContent || saving) return;
    setSaving(true);
    try {
      const next = current.current;
      await store({
        ...next,
        error: undefined,
        queued: true,
        item: {
          ...next.item,
          title: workItemTitle(
            next.item.notes,
            next.files.length + (next.item.attachments?.length ?? 0),
          ),
          updatedAt: new Date().toISOString(),
        },
      });
      onSaved();
    } catch (cause) {
      setError(`Could not save: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  }
  const initialCapture = useRef(previous ? null : capture);
  useEffect(() => {
    const initial = initialCapture.current;
    if (
      initial &&
      (initial.item.notes.trim() || initial.files.length || initial.item.attachments?.length)
    ) {
      void withTaskCaptureLock(() => writeTaskCapture(initial), initial.id).catch((cause) =>
        setError(String(cause)),
      );
    }
  }, []);
  useEffect(() => {
    if (!closeRef) return;
    closeRef.current = async () => {
      const latest = current.current;
      const count = latest.files.length + (latest.item.attachments?.length ?? 0);
      if (latest.queued || (!latest.item.notes.trim() && !count)) return true;
      try {
        const saved = {
          ...latest,
          queued: true,
          item: { ...latest.item, title: workItemTitle(latest.item.notes, count) },
        };
        await withTaskCaptureLock(() => writeTaskCapture(saved), saved.id);
        current.current = saved;
        return true;
      } catch (cause) {
        setError(`Could not save: ${String(cause)}`);
        return false;
      }
    };
    return () => {
      closeRef.current = null;
    };
  }, [closeRef]);
  async function updatePending(action: "retry" | "trash") {
    setSaving(true);
    try {
      await withTaskCaptureLock(async () => {
        const latest = (await readTaskCaptures()).find((entry) => entry.id === capture.id);
        if (!latest) throw new Error("This task has synced. Close and reopen its Task details.");
        const next =
          action === "retry"
            ? { ...latest, error: undefined }
            : {
                ...latest,
                item: {
                  ...latest.item,
                  deletedAt: latest.item.deletedAt ? null : new Date().toISOString(),
                },
              };
        await writeTaskCapture(next);
        current.current = next;
        setCapture(next);
      }, capture.id);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  if (request.localCaptureId && !previous)
    return (
      <div className="space-y-3">
        <p className="text-sm">This task has synced. Open it from the dashboard to edit it.</p>
        <Button size="sm" onClick={onSaved}>
          Close
        </Button>
      </div>
    );
  if (previous?.queued)
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{capture.item.title}</p>
        <p className="whitespace-pre-wrap text-sm">{capture.item.notes}</p>
        <div className="flex flex-wrap gap-2">
          {capture.files.map((file, index) => (
            <LocalTaskImage key={index} file={file} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {capture.error ?? "Saved on this device. Waiting to sync. You can close this window."}
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={saving} onClick={() => void updatePending("retry")}>
            Retry sync
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => void updatePending("trash")}
          >
            {capture.item.deletedAt ? "Restore task" : "Delete task"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div
      className="space-y-3"
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
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          event.stopPropagation();
          void addFiles(Array.from(event.dataTransfer.files));
        }
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {profile?.name ?? "Unassigned"}
          {capture.item.spaceId
            ? ` / ${profile?.spaces?.find((space) => space.id === capture.item.spaceId)?.name ?? "Space"}`
            : " / Unsorted"}
        </span>
        <Button size="xs" variant="ghost" onClick={() => setAssign(!assign)}>
          Change
        </Button>
      </div>
      {assign && (
        <div className="grid grid-cols-2 gap-2">
          <TaskSelect
            label="Profile"
            ariaLabel="Task profile"
            value={capture.item.profileId ?? ""}
            onChange={(value) => change({ profileId: value || null, spaceId: null })}
            options={[
              { value: "", label: "Choose later" },
              ...profiles.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <TaskSelect
            label="Space"
            ariaLabel="Task space"
            value={capture.item.spaceId ?? ""}
            onChange={(value) => change({ spaceId: value || null })}
            options={[
              { value: "", label: "Unsorted" },
              ...(profile?.spaces ?? []).map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </div>
      )}
      <Textarea
        autoFocus
        aria-label="Task request"
        placeholder="What do you need to come back to? Paste screenshots here."
        value={capture.item.notes}
        maxLength={32000}
        onChange={(event) => change({ notes: event.target.value })}
      />
      {(capture.files.length > 0 || !!capture.item.attachments?.length) && (
        <div className="flex flex-wrap gap-2">
          {capture.files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex max-w-full items-center gap-1 rounded-lg border p-1"
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-xs"
                onClick={() => setPreview(file)}
              >
                {file.type.startsWith("image/") && <LocalTaskImage file={file} />}
                <span className="max-w-40 truncate">{file.name}</span>
              </button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  void store({
                    ...current.current,
                    files: current.current.files.filter((_, i) => i !== index),
                  }).catch((cause) => setError(String(cause)));
                }}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          {capture.item.attachments?.map((file) => (
            <span key={file.id} className="text-xs">
              {file.name}
            </span>
          ))}
        </div>
      )}
      {preview && (
        <div className="rounded-lg border p-2">
          <LocalTaskImage file={preview} large />
          <Button size="xs" variant="ghost" onClick={() => setPreview(null)}>
            Close preview
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
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
        <Button size="xs" variant="ghost" onClick={() => fileInput.current?.click()}>
          <PaperclipIcon />
          Attach
        </Button>
        <Button size="sm" disabled={!hasContent || saving} onClick={() => void save()}>
          {saving ? "Saving..." : "Save task"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {capture.queued
          ? "Saved on this device. Sync pending."
          : "Closing keeps this task. Choose where to work later."}
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function LocalTaskImage({ file, large = false }: { file: File; large?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return file.type.startsWith("image/") ? (
    <img
      src={url}
      alt={file.name}
      className={large ? "max-h-80 max-w-full object-contain" : "size-12 rounded object-cover"}
    />
  ) : (
    <span className="text-xs">{file.name}</span>
  );
}
