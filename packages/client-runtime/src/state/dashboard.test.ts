import { type OrchestrationThreadShell, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import {
  dashboardHistory,
  buildDashboard,
  classifyDashboardThread,
  isEscalated,
} from "./dashboard.ts";

const NOW = "2026-09-04T12:00:00.000Z";

function shell(overrides: Partial<OrchestrationThreadShell> = {}): OrchestrationThreadShell {
  return {
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
  } as OrchestrationThreadShell;
}

describe("classifyDashboardThread", () => {
  it("drops idle threads with no recent completion", () => {
    expect(classifyDashboardThread(shell(), NOW)).toBeNull();
  });

  it("puts approvals first even while the session runs", () => {
    const entry = classifyDashboardThread(
      shell({
        hasPendingApprovals: true,
        session: { status: "running" } as OrchestrationThreadShell["session"],
      }),
      NOW,
    );
    expect(entry?.lane).toBe("needs-you");
    expect(entry?.reason).toBe("pending-approval");
  });

  it("surfaces a snoozed thread only when it raises a hand", () => {
    const snoozedUntil = "2026-09-05T12:00:00.000Z";
    expect(
      classifyDashboardThread(
        shell({ snoozedUntil, session: { status: "running" } as never }),
        NOW,
      ),
    ).toBeNull();
    expect(
      classifyDashboardThread(shell({ snoozedUntil, hasPendingUserInput: true }), NOW)?.reason,
    ).toBe("awaiting-input");
  });

  it("classifies running, connecting, plan ready, and monitoring", () => {
    expect(
      classifyDashboardThread(
        shell({
          latestTurn: {
            turnId: "t",
            state: "running",
            requestedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:01:00.000Z",
            completedAt: null,
            assistantMessageId: null,
          } as never,
        }),
        NOW,
      ),
    ).toMatchObject({ lane: "running", reason: "working", since: "2026-09-04T11:01:00.000Z" });
    expect(
      classifyDashboardThread(shell({ session: { status: "starting" } as never }), NOW)?.reason,
    ).toBe("connecting");
    // Running session but the latest turn already completed (e.g. mid-turn
    // handoff): since falls back to the session's updatedAt, not the stale
    // turn's startedAt.
    expect(
      classifyDashboardThread(
        shell({
          session: {
            status: "running",
            updatedAt: "2026-09-04T11:45:00.000Z",
          } as never,
          latestTurn: {
            turnId: "t",
            state: "completed",
            requestedAt: "2026-09-04T10:00:00.000Z",
            startedAt: "2026-09-04T10:00:00.000Z",
            completedAt: "2026-09-04T10:05:00.000Z",
            assistantMessageId: null,
          } as never,
        }),
        NOW,
      ),
    ).toMatchObject({ lane: "running", reason: "working", since: "2026-09-04T11:45:00.000Z" });
    expect(
      classifyDashboardThread(
        shell({
          interactionMode: "plan",
          hasActionableProposedPlan: true,
          latestTurn: {
            turnId: "t",
            state: "completed",
            requestedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            completedAt: "2026-09-04T11:05:00.000Z",
            assistantMessageId: null,
          } as never,
        }),
        NOW,
      ),
    ).toMatchObject({ lane: "needs-you", reason: "plan-ready" });
    expect(
      classifyDashboardThread(
        shell({ interactionMode: "plan", hasActionableProposedPlan: true }),
        NOW,
      ),
    ).toBeNull();
    expect(
      classifyDashboardThread(
        shell({
          interactionMode: "plan",
          hasActionableProposedPlan: true,
          latestTurn: {
            turnId: "t",
            state: "running",
            requestedAt: "2026-09-04T11:00:00.000Z",
            startedAt: "2026-09-04T11:00:00.000Z",
            completedAt: null,
            assistantMessageId: null,
          } as never,
        }),
        NOW,
      )?.reason,
    ).toBe("working");
    expect(classifyDashboardThread(shell({ backgroundLiveness: "monitoring" }), NOW)?.lane).toBe(
      "monitoring",
    );
  });

  it("keeps completions inside the 24h window and drops older ones", () => {
    const turn = (completedAt: string, state = "completed") =>
      ({
        turnId: "t",
        state,
        requestedAt: completedAt,
        startedAt: completedAt,
        completedAt,
        assistantMessageId: null,
      }) as never;
    expect(
      classifyDashboardThread(shell({ latestTurn: turn("2026-09-04T00:00:00.000Z") }), NOW),
    ).toMatchObject({ lane: "done", reason: "completed" });
    expect(
      classifyDashboardThread(shell({ latestTurn: turn("2026-09-02T00:00:00.000Z") }), NOW),
    ).toBeNull();
    expect(
      classifyDashboardThread(
        shell({ latestTurn: turn("2026-09-04T01:00:00.000Z", "error") }),
        NOW,
      ),
    ).toMatchObject({ lane: "needs-you", reason: "failed" });
    expect(
      classifyDashboardThread(
        shell({ latestTurn: turn("2026-09-04T01:00:00.000Z", "interrupted") }),
        NOW,
      ),
    ).toMatchObject({ lane: "needs-you", reason: "interrupted" });
  });

  it("keeps snoozed, settled and archived work out of active results but available in their own views", () => {
    const completed = shell({
      latestTurn: { state: "completed", completedAt: "2026-09-01T11:00:00.000Z" } as never,
    });
    for (const [visibility, overrides] of [
      ["snoozed", { snoozedUntil: "2026-09-05T12:00:00.000Z" }],
      ["settled", { settledOverride: "settled" }],
      ["archived", { archivedAt: NOW }],
    ] as const) {
      const hidden = { ...completed, ...overrides };
      expect(classifyDashboardThread(hidden, NOW)).toBeNull();
      expect(dashboardHistory([hidden], NOW, visibility)).toEqual([hidden]);
      const idle = { ...hidden, latestTurn: null, session: null };
      expect(dashboardHistory([idle], NOW, visibility)).toEqual([idle]);
      expect(dashboardHistory([completed], NOW, visibility)).toEqual([]);
    }
    expect(
      classifyDashboardThread(shell({ settledOverride: "settled", hasPendingApprovals: true }), NOW)
        ?.lane,
    ).toBe("needs-you");
  });

  it("never shows archived threads", () => {
    expect(
      classifyDashboardThread(shell({ archivedAt: NOW, hasPendingApprovals: true }), NOW),
    ).toBeNull();
  });
});

describe("buildDashboard", () => {
  it("sorts needs-you by longest wait and counts lanes", () => {
    const board = buildDashboard(
      [
        shell({
          id: ThreadId.make("recent"),
          hasPendingApprovals: true,
          updatedAt: "2026-09-04T11:59:00.000Z",
        }),
        shell({
          id: ThreadId.make("old"),
          hasPendingApprovals: true,
          updatedAt: "2026-09-04T11:00:00.000Z",
        }),
        shell({ id: ThreadId.make("run"), session: { status: "running" } as never }),
      ],
      NOW,
    );
    expect(board.lanes["needs-you"].map((entry) => entry.shell.id)).toEqual(["old", "recent"]);
    expect(board.counts).toEqual({ "needs-you": 2, running: 1, monitoring: 0, done: 0 });
    expect(isEscalated(board.lanes["needs-you"][0]!, NOW)).toBe(true);
    expect(isEscalated(board.lanes["needs-you"][1]!, NOW)).toBe(false);
  });
});

describe("dashboardHistory", () => {
  it("sorts snoozed chats by return time and excludes expired snoozes and archives", () => {
    const early = shell({ id: ThreadId.make("early"), snoozedUntil: "2026-09-04T13:00:00.000Z" });
    const later = shell({ id: ThreadId.make("later"), snoozedUntil: "2026-09-05T13:00:00.000Z" });
    expect(
      dashboardHistory(
        [later, early, shell({ snoozedUntil: NOW }), { ...early, archivedAt: NOW }],
        NOW,
        "snoozed",
      ),
    ).toEqual([early, later]);
    const old = shell({ settledOverride: "settled", settledAt: "2026-08-01T00:00:00.000Z" });
    const recent = shell({ settledOverride: "settled", settledAt: NOW });
    expect(dashboardHistory([old, recent, { ...recent, archivedAt: NOW }], NOW, "settled")).toEqual(
      [recent, old],
    );
  });
});
