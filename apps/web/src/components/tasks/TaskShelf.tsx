import { ClipboardListIcon } from "lucide-react";
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
  const { environments } = useEnvironments();
  const shown = new Set(visibleThreadKeys);
  const represented = new Set<string>();
  for (const key of shown) {
    const first = tasks.find((entry) => `${entry.environmentId}:${entry.item.threadId}` === key);
    if (first) represented.add(`${first.environmentId}:${first.item.id}`);
  }
  const eligible = tasks.filter(
    ({ environmentId: device, item }) =>
      (!profileId || profileId === "all" || item.profileId === profileId) &&
      (spaceId === undefined || item.spaceId === spaceId) &&
      (!environmentId || device === environmentId) &&
      (!projectKey || projectKey === "all" || `${device}:${item.projectId}` === projectKey) &&
      `${item.title} ${item.notes} ${item.brief}`.toLowerCase().includes(search.toLowerCase()) &&
      !represented.has(`${device}:${item.id}`),
  );
  const render = (task: LocatedWorkItem) => (
    <button
      key={`${task.environmentId}:${task.item.id}`}
      type="button"
      onClick={() => openWorkItem(task)}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-card p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="line-clamp-2 text-sm font-medium">{task.item.title}</span>
      <span className="line-clamp-2 text-xs text-muted-foreground">
        {task.item.preparation?.state === "failed"
          ? "Brief preparation failed. Open to retry."
          : task.item.brief || task.item.notes || "Add context when you have it."}
      </span>
      <span className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="capitalize">
          {task.item.status}
          {task.item.threadId ? " · Chat linked" : ""}
        </span>
        <span>
          {environments.find((env) => env.environmentId === task.environmentId)?.label ??
            "Offline device"}
        </span>
      </span>
    </button>
  );
  return (
    <section
      aria-label="Planned work"
      className="col-span-full space-y-3 rounded-xl border border-border/70 bg-card/50 p-3"
    >
      <div className="flex items-center gap-2">
        <ClipboardListIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Planned work</h2>
        {!eligible.some(({ item }) => item.status !== "done") && (
          <span className="ml-auto text-xs text-muted-foreground">No planned tasks</span>
        )}
      </div>
      <div className="grid gap-2 empty:hidden sm:grid-cols-2 xl:grid-cols-3">
        {eligible.filter(({ item }) => item.status !== "done").map(render)}
      </div>
      {eligible.some(({ item }) => item.status === "done") && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Completed tasks
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {eligible.filter(({ item }) => item.status === "done").map(render)}
          </div>
        </details>
      )}
    </section>
  );
}
