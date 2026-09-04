/**
 * Pure grouping and filter helpers for the dashboard page. Kept separate from
 * DashboardPage.tsx so ordering rules are unit-testable without rendering.
 */
import type {
  DashboardBoard,
  DashboardEntry,
  DashboardLane,
} from "@t3tools/client-runtime/state/dashboard";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

export type DashboardBoardEntry = DashboardEntry<EnvironmentThreadShell>;

/** Lane render order: most urgent first, mirrors the sidebar status priority. */
export const DASHBOARD_LANE_ORDER: ReadonlyArray<DashboardLane> = [
  "needs-you",
  "running",
  "monitoring",
  "done",
];

export interface DashboardProjectGroup {
  readonly projectKey: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly entries: ReadonlyArray<DashboardBoardEntry>;
}

export function dashboardProjectKey(environmentId: EnvironmentId, projectId: ProjectId): string {
  return `${environmentId}:${projectId}`;
}

/**
 * Flattens lanes in priority order. Each lane keeps buildDashboard's own
 * sort (needs-you longest-wait-first, the rest most-recent-first), so the
 * result is already "lane priority then since" ordered.
 */
export function flattenBoardEntries(
  board: DashboardBoard<EnvironmentThreadShell>,
): ReadonlyArray<DashboardBoardEntry> {
  return DASHBOARD_LANE_ORDER.flatMap((lane) => board.lanes[lane]);
}

export function filterEntriesByLane(
  entries: ReadonlyArray<DashboardBoardEntry>,
  lane: DashboardLane | null,
): ReadonlyArray<DashboardBoardEntry> {
  return lane === null ? entries : entries.filter((entry) => entry.lane === lane);
}

export function filterEntriesByEnvironment(
  entries: ReadonlyArray<DashboardBoardEntry>,
  environmentId: EnvironmentId | null,
): ReadonlyArray<DashboardBoardEntry> {
  return environmentId === null
    ? entries
    : entries.filter((entry) => entry.shell.environmentId === environmentId);
}

/**
 * Applies the environment filter to every lane and recomputes counts from
 * the filtered lanes, so tiles, section counts, and the empty state all
 * agree with what actually renders.
 */
export function filterBoardByEnvironment(
  board: DashboardBoard<EnvironmentThreadShell>,
  environmentId: EnvironmentId | null,
): DashboardBoard<EnvironmentThreadShell> {
  if (environmentId === null) return board;
  const lanes = Object.fromEntries(
    DASHBOARD_LANE_ORDER.map((lane) => [
      lane,
      filterEntriesByEnvironment(board.lanes[lane], environmentId),
    ]),
  ) as Record<DashboardLane, ReadonlyArray<DashboardBoardEntry>>;
  const counts = Object.fromEntries(
    DASHBOARD_LANE_ORDER.map((lane) => [lane, lanes[lane].length]),
  ) as Record<DashboardLane, number>;
  return { lanes, counts };
}

/**
 * Drops "done" entries the user has already seen: the thread's completion
 * (`entry.since`) is not later than the last time they visited that thread.
 * Other lanes are untouched.
 */
export function dropSeenDoneEntries(
  board: DashboardBoard<EnvironmentThreadShell>,
  threadLastVisitedAtById: Readonly<Record<string, string>>,
  keyForShell: (shell: EnvironmentThreadShell) => string,
): DashboardBoard<EnvironmentThreadShell> {
  const done = board.lanes.done.filter((entry) => {
    const lastVisitedAt = threadLastVisitedAtById[keyForShell(entry.shell)];
    if (!lastVisitedAt) return true;
    const visitedMs = Date.parse(lastVisitedAt);
    const sinceMs = Date.parse(entry.since);
    return Number.isNaN(visitedMs) || Number.isNaN(sinceMs) || sinceMs > visitedMs;
  });
  return {
    lanes: { ...board.lanes, done },
    counts: { ...board.counts, done: done.length },
  };
}

/**
 * One section per project holding at least one entry. Groups are emitted in
 * first-appearance order of the (already lane-priority-ordered) input list,
 * so the project holding the most urgent entry (needs-you first) sorts
 * first, with no separate comparator needed.
 */
export function groupEntriesByProject(
  entries: ReadonlyArray<DashboardBoardEntry>,
): ReadonlyArray<DashboardProjectGroup> {
  const groups = new Map<string, DashboardBoardEntry[]>();
  const order: Array<{ key: string; environmentId: EnvironmentId; projectId: ProjectId }> = [];
  for (const entry of entries) {
    const key = dashboardProjectKey(entry.shell.environmentId, entry.shell.projectId);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push({
        key,
        environmentId: entry.shell.environmentId,
        projectId: entry.shell.projectId,
      });
    }
    group.push(entry);
  }
  return order.map(({ key, environmentId, projectId }) => ({
    projectKey: key,
    environmentId,
    projectId,
    entries: groups.get(key) ?? [],
  }));
}
