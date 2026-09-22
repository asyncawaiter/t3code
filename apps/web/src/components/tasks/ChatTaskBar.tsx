import { taskAttachmentUrl } from "./taskAttachments";
import { randomUUID } from "../../lib/utils";
import { ClipboardListIcon } from "lucide-react";
import { useState } from "react";
import {
  type EnvironmentId,
  type ThreadId,
  workItemPrompt,
  workItemChats,
} from "@t3tools/contracts";
import { useWorkItems, openWorkItem } from "../../workItems";
import { TaskSelect } from "./TaskSelect";
import { Button } from "../ui/button";
import { useComposerDraftStore } from "../../composerDraftStore";

export function ChatTaskBar({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const tasks = useWorkItems().filter(
    (entry) =>
      !entry.item.deletedAt &&
      workItemChats(entry.item, entry.environmentId).some(
        (chat) => chat.environmentId === environmentId && chat.threadId === threadId,
      ),
  );
  const [selected, setSelected] = useState("");
  const task =
    tasks.find((entry) => `${entry.environmentId}:${entry.item.id}` === selected) ?? tasks[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!task) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-2 text-xs">
      {tasks.length > 1 && (
        <TaskSelect
          label="Task"
          ariaLabel="Chat task"
          value={`${task.environmentId}:${task.item.id}`}
          onChange={setSelected}
          options={tasks.map((entry) => ({
            value: `${entry.environmentId}:${entry.item.id}`,
            label: entry.item.title,
          }))}
        />
      )}
      <button
        aria-label={`Task details: ${task.item.title}`}
        className="flex min-w-0 items-center gap-1.5 text-left font-medium hover:underline"
        onClick={() => openWorkItem(task)}
      >
        <ClipboardListIcon className="size-3.5 text-muted-foreground" />
        Task details
      </button>
      <span className="mr-auto capitalize text-muted-foreground">{task.item.status}</span>
      <Button
        size="xs"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          const store = useComposerDraftStore.getState();
          const target = { environmentId, threadId };
          if (
            store.getComposerDraft(target)?.prompt.trim() ||
            store.getComposerDraft(target)?.images.length ||
            store.getComposerDraft(target)?.files.length
          ) {
            setError("Send or clear your draft before inserting the brief.");
            return;
          }
          setBusy(true);
          try {
            const files = await Promise.all(
              (task.item.attachments ?? []).map(async (attachment) => {
                const response = await fetch(
                  await taskAttachmentUrl(task.environmentId, attachment),
                  {
                    signal: AbortSignal.timeout(60_000),
                  },
                );
                if (!response.ok) throw new Error(`Could not load ${attachment.name}.`);
                return {
                  attachment,
                  file: new File([await response.blob()], attachment.name, {
                    type: attachment.mimeType,
                  }),
                };
              }),
            );
            // Recheck after loading: typing during a download must never be overwritten.
            const current = store.getComposerDraft(target);
            if (current?.prompt.trim() || current?.images.length || current?.files.length)
              throw new Error("Your draft changed. Clear it before inserting the brief.");
            store.setPrompt(target, workItemPrompt(task.item));
            for (const { attachment, file } of files) {
              const id = randomUUID();
              if (attachment.type === "image")
                store.addImage(target, {
                  ...attachment,
                  type: "image",
                  id,
                  file,
                  previewUrl: URL.createObjectURL(file),
                });
              else
                store.addFiles(target, [
                  {
                    name: attachment.name,
                    mimeType: attachment.mimeType,
                    sizeBytes: attachment.sizeBytes,
                    type: "file",
                    id,
                    file,
                  },
                ]);
            }
            setError(null);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load the handoff.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Use brief
      </Button>
      {error && (
        <span role="alert" className="w-full text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
