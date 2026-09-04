import type { OrchestrationThreadShell } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import type { DashboardBoard } from "@t3tools/client-runtime/state/dashboard";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  dropSeenDoneEntries,
  filterBoardByEnvironment,
  filterEntriesByEnvironment,
  filterEntriesByLane,
  flattenBoardEntries,
  groupEntriesByProject,
  type DashboardBoardEntry,
} from "./DashboardPage.logic";

function shell(overrides: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId: "env-1",
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    modelSelection: { provider: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T11:30:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  } as EnvironmentThreadShell;
}

function entry(
  overrides: Partial<DashboardBoardEntry> & { shell: EnvironmentThreadShell },
): DashboardBoardEntry {
  return {
    lane: "needs-you",
    reason: "pending-approval",
    since: "2026-09-04T11:00:00.000Z",
    ...overrides,
  };
}

describe("flattenBoardEntries", () => {
  it("orders lanes needs-you, running, monitoring, done", () => {
    const needsYou = entry({ shell: shell({ id: "t1" as OrchestrationThreadShell["id"] }) });
    const running = entry({
      lane: "running",
      reason: "working",
      shell: shell({ id: "t2" as OrchestrationThreadShell["id"] }),
    });
    const board: DashboardBoard<EnvironmentThreadShell> = {
      lanes: { "needs-you": [needsYou], running: [running], monitoring: [], done: [] },
      counts: { "needs-you": 1, running: 1, monitoring: 0, done: 0 },
    };
    expect(flattenBoardEntries(board)).toEqual([needsYou, running]);
  });
});

describe("filterEntriesByLane", () => {
  it("passes everything through for a null filter", () => {
    const entries = [
      entry({ shell: shell({ id: "t1" as OrchestrationThreadShell["id"] }) }),
      entry({ lane: "running", shell: shell({ id: "t2" as OrchestrationThreadShell["id"] }) }),
    ];
    expect(filterEntriesByLane(entries, null)).toEqual(entries);
  });

  it("keeps only the matching lane", () => {
    const needsYou = entry({ shell: shell({ id: "t1" as OrchestrationThreadShell["id"] }) });
    const running = entry({
      lane: "running",
      shell: shell({ id: "t2" as OrchestrationThreadShell["id"] }),
    });
    expect(filterEntriesByLane([needsYou, running], "running")).toEqual([running]);
  });
});

describe("filterEntriesByEnvironment", () => {
  it("passes everything through for a null environment", () => {
    const entries = [entry({ shell: shell() })];
    expect(filterEntriesByEnvironment(entries, null)).toEqual(entries);
  });

  it("keeps only entries scoped to the given environment", () => {
    const envA = entry({
      shell: shell({ environmentId: "env-a" as EnvironmentThreadShell["environmentId"] }),
    });
    const envB = entry({
      shell: shell({ environmentId: "env-b" as EnvironmentThreadShell["environmentId"] }),
    });
    expect(
      filterEntriesByEnvironment([envA, envB], "env-a" as EnvironmentThreadShell["environmentId"]),
    ).toEqual([envA]);
  });
});

describe("filterBoardByEnvironment", () => {
  it("recomputes counts from the filtered lanes so tiles agree with rendering", () => {
    const envA1 = entry({
      shell: shell({
        environmentId: "env-a" as EnvironmentThreadShell["environmentId"],
        id: "t-a1" as OrchestrationThreadShell["id"],
      }),
    });
    const envA2 = entry({
      lane: "running",
      reason: "working",
      shell: shell({
        environmentId: "env-a" as EnvironmentThreadShell["environmentId"],
        id: "t-a2" as OrchestrationThreadShell["id"],
      }),
    });
    const envB = entry({
      shell: shell({
        environmentId: "env-b" as EnvironmentThreadShell["environmentId"],
        id: "t-b" as OrchestrationThreadShell["id"],
      }),
    });
    const board: DashboardBoard<EnvironmentThreadShell> = {
      lanes: { "needs-you": [envA1, envB], running: [envA2], monitoring: [], done: [] },
      counts: { "needs-you": 2, running: 1, monitoring: 0, done: 0 },
    };
    const filtered = filterBoardByEnvironment(
      board,
      "env-a" as EnvironmentThreadShell["environmentId"],
    );
    expect(filtered.lanes["needs-you"]).toEqual([envA1]);
    expect(filtered.counts).toEqual({ "needs-you": 1, running: 1, monitoring: 0, done: 0 });
  });

  it("passes the board through unchanged for a null environment", () => {
    const board: DashboardBoard<EnvironmentThreadShell> = {
      lanes: { "needs-you": [entry({ shell: shell() })], running: [], monitoring: [], done: [] },
      counts: { "needs-you": 1, running: 0, monitoring: 0, done: 0 },
    };
    expect(filterBoardByEnvironment(board, null)).toBe(board);
  });
});

describe("dropSeenDoneEntries", () => {
  const keyForShell = (s: EnvironmentThreadShell) => s.id;

  it("drops a done entry whose completion is not later than the last visit", () => {
    const seen = entry({
      lane: "done",
      reason: "completed",
      since: "2026-09-04T10:00:00.000Z",
      shell: shell({ id: "seen" as OrchestrationThreadShell["id"] }),
    });
    const unseen = entry({
      lane: "done",
      reason: "completed",
      since: "2026-09-04T12:00:00.000Z",
      shell: shell({ id: "unseen" as OrchestrationThreadShell["id"] }),
    });
    const neverVisited = entry({
      lane: "done",
      reason: "completed",
      since: "2026-09-04T09:00:00.000Z",
      shell: shell({ id: "never-visited" as OrchestrationThreadShell["id"] }),
    });
    const board: DashboardBoard<EnvironmentThreadShell> = {
      lanes: { "needs-you": [], running: [], monitoring: [], done: [seen, unseen, neverVisited] },
      counts: { "needs-you": 0, running: 0, monitoring: 0, done: 3 },
    };
    const result = dropSeenDoneEntries(
      board,
      { seen: "2026-09-04T11:00:00.000Z", unseen: "2026-09-04T11:00:00.000Z" },
      keyForShell,
    );
    expect(result.lanes.done).toEqual([unseen, neverVisited]);
    expect(result.counts.done).toBe(2);
  });

  it("leaves other lanes untouched", () => {
    const runningEntry = entry({
      lane: "running",
      reason: "working",
      shell: shell({ id: "r1" as OrchestrationThreadShell["id"] }),
    });
    const board: DashboardBoard<EnvironmentThreadShell> = {
      lanes: { "needs-you": [], running: [runningEntry], monitoring: [], done: [] },
      counts: { "needs-you": 0, running: 1, monitoring: 0, done: 0 },
    };
    expect(dropSeenDoneEntries(board, {}, keyForShell).lanes.running).toEqual([runningEntry]);
  });
});

describe("groupEntriesByProject", () => {
  it("orders project groups by the most urgent entry, needs-you first", () => {
    // Project B's only entry is "done"; project A has a running entry and a
    // later needs-you entry. Feeding flattenBoardEntries' lane-priority order
    // in, project A must sort first because its needs-you entry is more
    // urgent than anything project B holds.
    const projectBDone = entry({
      lane: "done",
      reason: "completed",
      shell: shell({
        projectId: "project-b" as OrchestrationThreadShell["projectId"],
        id: "t-b" as OrchestrationThreadShell["id"],
      }),
    });
    const projectANeedsYou = entry({
      shell: shell({
        projectId: "project-a" as OrchestrationThreadShell["projectId"],
        id: "t-a1" as OrchestrationThreadShell["id"],
      }),
    });
    const projectARunning = entry({
      lane: "running",
      reason: "working",
      shell: shell({
        projectId: "project-a" as OrchestrationThreadShell["projectId"],
        id: "t-a2" as OrchestrationThreadShell["id"],
      }),
    });

    // Input arrives in lane-priority order (needs-you, running, ..., done),
    // as flattenBoardEntries would produce it.
    const groups = groupEntriesByProject([projectANeedsYou, projectARunning, projectBDone]);

    expect(groups.map((group) => group.projectId)).toEqual(["project-a", "project-b"]);
    expect(groups[0]?.entries).toEqual([projectANeedsYou, projectARunning]);
    expect(groups[1]?.entries).toEqual([projectBDone]);
  });

  it("returns no groups for an empty entry list", () => {
    expect(groupEntriesByProject([])).toEqual([]);
  });
});
