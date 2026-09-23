import type { EnvironmentId, ThreadId, MessageId } from "@t3tools/contracts";
import { workItemStage } from "@t3tools/contracts";
import { useWorkItems, openWorkItem } from "../../workItems";
import { ClipboardListIcon } from "lucide-react";

/** Task context belongs to its handoff message, not a permanent chat banner. */
export function TaskMessageLink({
  environmentId,
  threadId,
  messageId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  messageId: MessageId;
}) {
  const tasks = useWorkItems().filter(
    ({ item }) =>
      !item.deletedAt &&
      item.handoffs?.some(
        (handoff) =>
          handoff.environmentId === environmentId &&
          handoff.threadId === threadId &&
          handoff.messageId === messageId,
      ),
  );
  if (!tasks.length) return null;
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {tasks.map((task) => (
        <button
          key={`${task.environmentId}:${task.item.id}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => openWorkItem(task)}
        >
          <ClipboardListIcon className="size-3 shrink-0" />
          <span className="truncate">{task.item.title}</span>
          <span className="shrink-0">{workItemStage(task.item)}</span>
        </button>
      ))}
    </div>
  );
}
