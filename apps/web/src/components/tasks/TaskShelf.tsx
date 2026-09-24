import { useState, useRef, useLayoutEffect } from "react";
import { TaskForm } from "./WorkItemDialog";
import { QuickTaskCapture } from "./QuickTaskCapture";
import { usePrimarySettings } from "../../hooks/useSettings";
import { ProfileDot } from "../sidebar/ProfileStrip";
import { filterTaskShelfItems, groupTasksBySpace } from "./TaskShelf.logic";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useNowMinute } from "../../hooks/useNowMinute";
import { workItemChats, workItemStage } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { useSaveWorkItem } from "../../workItems";
import { toastManager } from "../ui/toast";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  XIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDotIcon,
  ClipboardListIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { useWorkItems, openWorkItem, type LocatedWorkItem } from "../../workItems";
import { useEnvironments } from "../../state/environments";

export function TaskShelf({
  section = "planned",
  profileId,
  spaceId,
  environmentId,
  projectKey,
  search = "",
  query = "",
}: {
  section?: "planned" | "history";
  profileId?: string | null;
  spaceId?: string | null | undefined;
  environmentId?: string | null;
  projectKey?: string;
  search?: string;
  query?: string;
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    "t3.dashboard.plannedCollapsed",
    false,
    Schema.Boolean,
  );
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const expandedCard = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState(false);
  const taskKey = (task: LocatedWorkItem) => `${task.environmentId}:${task.item.id}`;
  const showTask = (task: LocatedWorkItem) =>
    section === "history" ? openWorkItem(task) : setExpanded(taskKey(task));
  const tasks = useWorkItems();
  const now = Date.parse(useNowMinute());
  const save = useSaveWorkItem();
  const { environments } = useEnvironments();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const eligible = filterTaskShelfItems(tasks, {
    profileId,
    spaceId,
    environmentId,
    projectKey,
    search,
    query,
  });
  const renderActions = (task: LocatedWorkItem) => (
    <>
      {!task.localCaptureId && (
        <Menu>
          <MenuTrigger
            render={
              <Button
                disabled={editorBusy}
                size="icon-xs"
                variant="ghost"
                aria-label="Task actions"
              />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={() => showTask(task)}>Task details</MenuItem>
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
    </>
  );
  const render = (task: LocatedWorkItem) => (
    <div
      key={`${task.environmentId}:${task.item.id}`}
      className={
        section === "history"
          ? "surface-raised-sm flex min-w-0 flex-col gap-1.5 rounded-xl px-4 py-3 text-left"
          : "flex min-w-0 flex-col gap-1 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-accent/30"
      }
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => showTask(task)}
          className={
            section === "history"
              ? "line-clamp-2 min-w-0 flex-1 text-left text-sm font-medium leading-5 hover:underline"
              : "line-clamp-2 min-w-0 flex-1 text-left text-[13px] font-medium leading-[18px] hover:underline"
          }
        >
          {task.item.title}
        </button>
        {renderActions(task)}
      </div>
      {(task.item.preparation?.state === "failed" ||
        task.item.brief ||
        task.item.notes !== task.item.title) && (
        <span className="line-clamp-1 text-xs text-muted-foreground">
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
      {!task.item.deletedAt &&
        section === "planned" &&
        workItemChats(task.item, task.environmentId).length > 0 && (
          <span className="text-[10px] text-muted-foreground">Chat selected, not sent</span>
        )}
      {section === "history" && (
        <span className="mt-0.5 flex items-center justify-between gap-3 text-xs text-foreground/65">
          {task.item.status === "working" || task.item.status === "done" ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-medium text-foreground/80 capitalize">
              {task.item.status === "done" ? (
                <CircleCheckIcon aria-hidden className="size-3" />
              ) : (
                <CircleDotIcon aria-hidden className="size-3" />
              )}
              {workItemStage(task.item)}
            </span>
          ) : (
            <span>
              {workItemChats(task.item, task.environmentId).length ? "Chat selected, not sent" : ""}
            </span>
          )}
          <span className="truncate">
            {task.item.executionEnvironmentId === null
              ? "Folder later"
              : (environments.find(
                  (env) =>
                    env.environmentId === (task.item.executionEnvironmentId ?? task.environmentId),
                )?.label ?? "Offline device")}
          </span>
        </span>
      )}
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
  const groups = groupTasksBySpace(planned, profiles);
  const activeGroup =
    spaceId === undefined ? groups.find((group) => group.key === selectedSpace) : undefined;
  const shown = activeGroup?.tasks ?? planned;
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setOverflow(node.scrollWidth > node.clientWidth + 1));
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    setOverflow(node.scrollWidth > node.clientWidth + 1);
    const card = expandedCard.current;
    if (card) {
      const left = card.offsetLeft - node.offsetLeft;
      if (left < node.scrollLeft) node.scrollLeft = left;
      else if (left + card.offsetWidth > node.scrollLeft + node.clientWidth)
        node.scrollLeft = Math.min(left, left + card.offsetWidth - node.clientWidth);
    }
    return () => observer.disconnect();
  }, [expanded, selectedSpace, collapsed, shown.length]);
  if (section === "history")
    return (
      <section aria-label="Task history" className="space-y-3">
        <div className="space-y-2">
          {history.sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt)).map(render)}
        </div>
        {!history.length && (
          <p className="p-3 text-xs text-muted-foreground">No tasks match this history.</p>
        )}
        <details className="group border-t border-border pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1.5 text-[13px] font-medium text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
            Trash
            <span className="text-muted-foreground tabular-nums">{trash.length}</span>
          </summary>
          {trash.length ? (
            <div className="mt-2 space-y-2">{trash.map(render)}</div>
          ) : (
            <p className="px-1 py-2 text-[13px] text-muted-foreground">Trash is empty.</p>
          )}
        </details>
      </section>
    );
  return (
    <section aria-label="Planned work" className="shrink-0 space-y-1.5">
      <div className="flex items-center gap-2">
        <h2>
          <button
            type="button"
            disabled={editorBusy}
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            className="flex items-center gap-2 rounded py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            {collapsed ? (
              <ChevronRightIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
            <ClipboardListIcon className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Planned work</span>
            <span className="text-xs tabular-nums text-muted-foreground">{planned.length}</span>
          </button>
        </h2>
      </div>
      {!collapsed &&
        (planned.length ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              {spaceId === undefined && (
                <div
                  role="group"
                  aria-label="Filter planned tasks by Space"
                  className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:thin]"
                >
                  <Button
                    size="xs"
                    variant={!activeGroup ? "secondary" : "ghost-muted"}
                    disabled={editorBusy}
                    aria-pressed={!activeGroup}
                    onClick={() => {
                      setSelectedSpace(null);
                      setExpanded(null);
                    }}
                  >
                    All {planned.length}
                  </Button>
                  {groups.map((group) => (
                    <Button
                      key={group.key}
                      size="xs"
                      variant={activeGroup?.key === group.key ? "secondary" : "ghost-muted"}
                      disabled={editorBusy}
                      aria-pressed={activeGroup?.key === group.key}
                      onClick={() => {
                        setSelectedSpace(group.key);
                        setExpanded(null);
                      }}
                    >
                      {group.color && <ProfileDot color={group.color} />}
                      {!profileId || profileId === "all"
                        ? `${group.profileName} / ${group.spaceName}`
                        : group.spaceName}{" "}
                      {group.tasks.length}
                    </Button>
                  ))}
                </div>
              )}
              {overflow && (
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Previous tasks"
                    onClick={() => strip.current?.scrollBy({ left: -300 })}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Next tasks"
                    onClick={() => strip.current?.scrollBy({ left: 300 })}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              )}
            </div>
            <div
              ref={strip}
              role="region"
              aria-label="Planned task cards"
              tabIndex={0}
              className={`relative flex min-w-0 gap-2 overflow-x-auto overflow-y-hidden p-1 [scrollbar-width:thin] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${expanded ? "h-56" : "h-44"}`}
            >
              {shown.map((task) => {
                const key = taskKey(task);
                const isExpanded = expanded === key;
                const preview = (task.item.brief || task.item.notes || "").trim();
                const showPreview = preview && !preview.startsWith(task.item.title.trim());
                const group = groups.find((group) => group.tasks.includes(task));
                return (
                  <article
                    key={key}
                    ref={isExpanded ? expandedCard : undefined}
                    aria-label={task.item.title}
                    className={`flex h-full shrink-0 overflow-hidden rounded-xl border bg-card ${isExpanded ? "w-[min(64rem,100%)] border-primary/40 ring-1 ring-primary/10" : "w-64 border-border/60"}`}
                  >
                    <div
                      className={`relative flex min-w-0 flex-col ${isExpanded ? "w-56 shrink-0 border-r border-border/60" : "w-full"}`}
                    >
                      <button
                        type="button"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} task: ${task.item.title}`}
                        disabled={editorBusy}
                        aria-expanded={isExpanded}
                        className="flex min-h-0 flex-1 flex-col gap-2 p-3 text-left outline-none hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => setExpanded(isExpanded ? null : key)}
                      >
                        {!activeGroup && spaceId === undefined && (
                          <span className="flex max-w-full shrink-0 items-center gap-1.5 truncate pr-6 text-[11px] text-muted-foreground">
                            {group?.color && <ProfileDot color={group.color} />}
                            {group?.spaceName ?? "Unsorted"}
                          </span>
                        )}
                        <span className="line-clamp-2 shrink-0 break-words pr-5 text-[13px] font-medium leading-5">
                          {task.item.title}
                        </span>
                        {showPreview && (
                          <span className="line-clamp-2 shrink-0 break-words text-xs leading-4 text-muted-foreground">
                            {preview}
                          </span>
                        )}
                        <span className="mt-auto flex w-full shrink-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="min-w-0 truncate">
                            {task.syncError ??
                              (task.localCaptureId
                                ? "Saved on this device"
                                : task.item.remindAt && Date.parse(task.item.remindAt) <= now
                                  ? "Reminder due"
                                  : task.item.preparation?.state === "failed"
                                    ? "Preparation failed"
                                    : task.item.attachments?.length
                                      ? `${task.item.attachments.length} attachment${task.item.attachments.length === 1 ? "" : "s"}`
                                      : "")}
                          </span>
                          {isExpanded ? (
                            <XIcon className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronRightIcon className="size-3.5 shrink-0" />
                          )}
                        </span>
                      </button>
                      <div className="absolute right-1.5 top-1.5">{renderActions(task)}</div>
                    </div>
                    {isExpanded && (
                      <div className="min-w-0 flex-1">
                        {task.localCaptureId ? (
                          <div className="h-full overflow-y-auto p-3">
                            <QuickTaskCapture request={task} onSaved={() => setExpanded(null)} />
                          </div>
                        ) : (
                          <TaskForm
                            inline
                            request={task}
                            onClose={() => setExpanded(null)}
                            onBusyChange={setEditorBusy}
                          />
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <p className="w-fit rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
            No tasks waiting to be picked up.
          </p>
        ))}
    </section>
  );
}
