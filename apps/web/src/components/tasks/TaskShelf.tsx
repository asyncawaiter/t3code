import { useNowMinute } from "../../hooks/useNowMinute";
import { workItemChats } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { useSaveWorkItem } from "../../workItems";
import { toastManager } from "../ui/toast";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { ClipboardListIcon, MoreHorizontalIcon } from "lucide-react";
import { useWorkItems, openWorkItem, type LocatedWorkItem } from "../../workItems";
import { useEnvironments } from "../../state/environments";

const NO_THREADS: readonly string[] = [];

export function TaskShelf({
  profileId,
  spaceId,
  environmentId,
  projectKey,
  search = "",
  visibleThreadKeys = NO_THREADS,
}: {
  profileId?: string | null;
  spaceId?: string | null | undefined;
  environmentId?: string | null;
  projectKey?: string;
  search?: string;
  visibleThreadKeys?: readonly string[];
}) {
  const tasks = useWorkItems();
  const now = Date.parse(useNowMinute());
  const save = useSaveWorkItem();
  const { environments } = useEnvironments();
  const shown = new Set(visibleThreadKeys);
  const represented = new Set<string>();
  for (const key of shown) {
    for (const entry of tasks.filter(
      (entry) =>
        !entry.item.deletedAt &&
        workItemChats(entry.item, entry.environmentId).some(
          (chat) => `${chat.environmentId}:${chat.threadId}` === key,
        ),
    ))
      represented.add(`${entry.environmentId}:${entry.item.id}`);
  }
  const eligible = tasks.filter(
    ({ environmentId: device, item }) =>
      (!profileId || profileId === "all" || item.profileId === profileId) &&
      (spaceId === undefined || item.spaceId === spaceId) &&
      (!environmentId || (item.executionEnvironmentId ?? device) === environmentId) &&
      (!projectKey ||
        projectKey === "all" ||
        `${item.executionEnvironmentId ?? device}:${item.projectId}` === projectKey) &&
      `${item.title} ${item.notes} ${item.brief}`.toLowerCase().includes(search.toLowerCase()) &&
      !represented.has(`${device}:${item.id}`),
  );
  const render = (task: LocatedWorkItem) => (
    <div
      key={`${task.environmentId}:${task.item.id}`}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-card p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => openWorkItem(task)}
          className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-medium hover:underline"
        >
          {task.item.title}
        </button>
        {!task.localCaptureId && (
          <Menu>
            <MenuTrigger
              render={<Button size="icon-xs" variant="ghost" aria-label="Task actions" />}
            >
              <MoreHorizontalIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => openWorkItem(task)}>Task details</MenuItem>
              {!task.item.deletedAt && (
                <MenuItem
                  onClick={() => {
                    void save(
                      task.environmentId,
                      {
                        ...task.item,
                        priority: Math.min(0, ...tasks.map(({ item }) => item.priority ?? 0)) - 1,
                        updatedAt: new Date().toISOString(),
                      },
                      task.item,
                    ).catch((cause) => toastManager.add({ type: "error", title: String(cause) }));
                  }}
                >
                  Move to top
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  void save(
                    task.environmentId,
                    {
                      ...task.item,
                      deletedAt: task.item.deletedAt ? null : new Date().toISOString(),
                      preparation: null,
                      updatedAt: new Date().toISOString(),
                    },
                    task.item,
                  )
                    .then((saved) => {
                      if (saved.deletedAt)
                        toastManager.add({
                          title: "Task moved to Trash",
                          description: "Linked chats are unchanged.",
                          actionProps: {
                            children: "Undo",
                            onClick: () => {
                              void save(
                                task.environmentId,
                                { ...saved, deletedAt: null, updatedAt: new Date().toISOString() },
                                saved,
                              ).catch((cause) =>
                                toastManager.add({ type: "error", title: String(cause) }),
                              );
                            },
                          },
                        });
                    })
                    .catch((cause) => toastManager.add({ type: "error", title: String(cause) }));
                }}
              >
                {task.item.deletedAt ? "Restore task" : "Delete task"}
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
      </div>
      <span className="line-clamp-2 text-xs text-muted-foreground">
        {task.item.preparation?.state === "failed"
          ? "Brief preparation failed. Open to retry."
          : task.item.brief || task.item.notes || "Add context when you have it."}
      </span>
      {task.item.remindAt && (
        <span className="text-xs text-muted-foreground">
          {Date.parse(task.item.remindAt) <= now
            ? "Reminder due"
            : new Date(task.item.remindAt).toLocaleString()}
        </span>
      )}
      {task.localCaptureId && (
        <span className="text-xs text-muted-foreground">
          {task.syncError ??
            (task.localDraft ? "Draft on this device" : "Saved locally, waiting to sync")}
        </span>
      )}
      <span className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="capitalize">
          {task.item.status}
          {workItemChats(task.item, task.environmentId).length
            ? ` · ${workItemChats(task.item, task.environmentId).length} linked`
            : ""}
        </span>
        <span>
          {task.item.executionEnvironmentId === null
            ? "Folder later"
            : (environments.find(
                (env) =>
                  env.environmentId === (task.item.executionEnvironmentId ?? task.environmentId),
              )?.label ?? "Offline device")}
        </span>
      </span>
    </div>
  );
  return (
    <section
      aria-label="Planned work"
      className="col-span-full space-y-3 rounded-xl border border-border/70 bg-card/50 p-3"
    >
      <div className="flex items-center gap-2">
        <ClipboardListIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Planned work</h2>
        {!eligible.some(({ item }) => !item.deletedAt && item.status !== "done") && (
          <span className="ml-auto text-xs text-muted-foreground">No planned tasks</span>
        )}
      </div>
      <div className="grid gap-2 empty:hidden sm:grid-cols-2 xl:grid-cols-3">
        {eligible
          .filter(({ item }) => !item.deletedAt && item.status !== "done")
          .sort(
            (a, b) =>
              (a.item.priority ?? 0) - (b.item.priority ?? 0) ||
              b.item.createdAt.localeCompare(a.item.createdAt),
          )
          .map(render)}
      </div>
      {eligible.some(({ item }) => !item.deletedAt && item.status === "done") && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Completed tasks
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {eligible.filter(({ item }) => !item.deletedAt && item.status === "done").map(render)}
          </div>
        </details>
      )}
      {eligible.some(({ item }) => item.deletedAt) && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Trash</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {eligible.filter(({ item }) => item.deletedAt).map(render)}
          </div>
        </details>
      )}
    </section>
  );
}
