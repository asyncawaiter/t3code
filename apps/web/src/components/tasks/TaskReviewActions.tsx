import { useState } from "react";
import type { EnvironmentId, ThreadId, MessageId } from "@t3tools/contracts";
import { workItemChats, returnWorkItemToPlanned } from "@t3tools/contracts";
import { useWorkItems, useSaveWorkItem } from "../../workItems";
import { MenuItem } from "../ui/menu";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

export function TaskReviewActions({
  environmentId,
  threadId,
  resultMessageId,
  menu = false,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  resultMessageId?: MessageId | null | undefined;
  menu?: boolean;
}) {
  const tasks = useWorkItems().filter(
    ({ environmentId: storage, item }) =>
      !item.deletedAt &&
      item.status === "working" &&
      workItemChats(item, storage).some(
        (chat) => chat.environmentId === environmentId && chat.threadId === threadId,
      ),
  );
  const save = useSaveWorkItem();
  const [busy, setBusy] = useState(false);
  return (
    <>
      {tasks.map((task) => {
        const update = async (complete: boolean) => {
          setBusy(true);
          try {
            const now = new Date().toISOString();
            const latest = task.item.handoffs?.findLast(
              (entry) =>
                entry.sentAt &&
                entry.threadId === threadId &&
                entry.environmentId === environmentId,
            );
            await save(
              task.environmentId,
              complete
                ? {
                    ...task.item,
                    status: "done",
                    completedAt: now,
                    remindAt: null,
                    preparation: null,
                    updatedAt: now,
                    ...(latest && resultMessageId
                      ? {
                          handoffs:
                            task.item.handoffs?.map((entry) =>
                              entry === latest ? { ...entry, resultMessageId } : entry,
                            ) ?? [],
                        }
                      : {}),
                  }
                : returnWorkItemToPlanned(task.item, now),
              task.item,
            );
            toastManager.add({
              title: complete ? "Task completed" : "Task returned to Planned work",
              description: task.item.title,
            });
          } catch (error) {
            toastManager.add({
              type: "error",
              title: "Could not update task",
              description: String(error),
            });
          } finally {
            setBusy(false);
          }
        };
        return menu ? (
          <div key={`${task.environmentId}:${task.item.id}`}>
            <MenuItem disabled={busy} onClick={() => void update(true)}>
              Complete task: {task.item.title}
            </MenuItem>
            <MenuItem disabled={busy} onClick={() => void update(false)}>
              Return to planned: {task.item.title}
            </MenuItem>
          </div>
        ) : (
          <Button
            key={`${task.environmentId}:${task.item.id}`}
            size="micro"
            variant="outline"
            disabled={busy}
            onClick={() => void update(true)}
            title={task.item.title}
          >
            Complete task{tasks.length > 1 ? `: ${task.item.title}` : ""}
          </Button>
        );
      })}
    </>
  );
}
