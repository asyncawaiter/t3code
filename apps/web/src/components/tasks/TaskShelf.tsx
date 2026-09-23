import { useNowMinute } from "../../hooks/useNowMinute";
import { workItemChats, workItemStage } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { useSaveWorkItem } from "../../workItems";
import { toastManager } from "../ui/toast";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { ClipboardListIcon, MoreHorizontalIcon } from "lucide-react";
import { useWorkItems, openWorkItem, type LocatedWorkItem } from "../../workItems";
import { useEnvironments } from "../../state/environments";

export function TaskShelf({
  section = "planned",
  profileId,
  spaceId,
  environmentId,
  projectKey,
  search = "",
}: {
  section?: "planned" | "history";
  profileId?: string | null;
  spaceId?: string | null | undefined;
  environmentId?: string | null;
  projectKey?: string;
  search?: string;
}) {
  const tasks = useWorkItems();
  const now = Date.parse(useNowMinute());
  const save = useSaveWorkItem();
  const { environments } = useEnvironments();
  const eligible = tasks.filter(
    ({ environmentId: device, item }) =>
      (!profileId || profileId === "all" || item.profileId === profileId) &&
      (spaceId === undefined || item.spaceId === spaceId) &&
      (!environmentId || (item.executionEnvironmentId ?? device) === environmentId) &&
      (!projectKey ||
        projectKey === "all" ||
        `${item.executionEnvironmentId ?? device}:${item.projectId}` === projectKey) &&
      `${item.title} ${item.notes} ${item.brief}`.toLowerCase().includes(search.toLowerCase()),
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
      {(task.item.preparation?.state === "failed" ||
        task.item.brief ||
        task.item.notes !== task.item.title) && (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {task.item.preparation?.state === "failed"
            ? "Brief preparation failed. Open to retry."
            : task.item.brief ||
              (task.item.notes.startsWith(`${task.item.title}\n`)
                ? task.item.notes.slice(task.item.title.length).trim()
                : task.item.notes) ||
              "Add context when you have it."}
        </span>
      )}
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
        <span className="">
          {task.item.status === "working" || task.item.status === "done"
            ? workItemStage(task.item)
            : workItemChats(task.item, task.environmentId).length
              ? "Chat selected, not sent"
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
  const planned = eligible
    .filter(({ item }) => !item.deletedAt && item.status !== "done" && item.status !== "working")
    .sort(
      (a, b) =>
        (a.item.priority ?? 0) - (b.item.priority ?? 0) ||
        b.item.createdAt.localeCompare(a.item.createdAt),
    );
  const history = eligible.filter(
    ({ item }) => !item.deletedAt && (item.status === "done" || item.status === "working"),
  );
  const trash = eligible.filter(({ item }) => item.deletedAt);
  const grid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),20rem))] gap-2";
  if (section === "history")
    return history.length || trash.length ? (
      <section aria-label="Task history" className="col-span-full space-y-2 pt-2">
        <details className="w-fit min-w-[min(100%,20rem)] max-w-full rounded-lg border border-border/60 bg-muted/10">
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium">
            Task history <span className="ml-2 text-muted-foreground">{history.length}</span>
          </summary>
          <div className="w-[min(64rem,100%)] space-y-2 border-t border-border/50 p-3">
            <div className={grid}>
              {history.sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt)).map(render)}
            </div>
            {trash.length > 0 && (
              <details>
                <summary className="cursor-pointer py-2 text-xs text-muted-foreground">
                  Trash ({trash.length})
                </summary>
                <div className={grid}>{trash.map(render)}</div>
              </details>
            )}
          </div>
        </details>
      </section>
    ) : null;
  return (
    <section aria-label="Planned work" className="col-span-full space-y-2">
      <div className="flex w-fit items-center gap-2">
        <ClipboardListIcon className="size-3.5 text-muted-foreground" />
        <h2 className="text-sm font-medium">Planned work</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{planned.length}</span>
      </div>
      {planned.length ? (
        <div className={`${grid} max-h-64 overflow-y-auto pr-1`}>{planned.map(render)}</div>
      ) : (
        <p className="w-fit rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
          No tasks waiting to be picked up.
        </p>
      )}
    </section>
  );
}
