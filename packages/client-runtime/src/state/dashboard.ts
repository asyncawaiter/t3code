/**
 * Cross-project dashboard lanes derived from thread shells.
 *
 * Pure so web and mobile render the same triage from the same projection.
 * Lane priority mirrors the sidebar status pill: something that needs the
 * user outranks live work, which outranks recent completions.
 */
import type { OrchestrationThreadShell } from "@t3tools/contracts";

export type DashboardLane = "needs-you" | "running" | "monitoring" | "done";

export type DashboardReason =
  | "pending-approval"
  | "awaiting-input"
  | "plan-ready"
  | "working"
  | "connecting"
  | "monitoring"
  | "completed"
  | "failed"
  | "interrupted";

export interface DashboardEntry<Shell extends OrchestrationThreadShell = OrchestrationThreadShell> {
  readonly shell: Shell;
  readonly lane: DashboardLane;
  readonly reason: DashboardReason;
  /** ISO time the thread entered this state, best effort from the shell. */
  readonly since: string;
}

export const DASHBOARD_DONE_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const DASHBOARD_WAITING_ESCALATION_MS = 10 * 60 * 1_000;

export const DASHBOARD_REASON_LABELS: Record<DashboardReason, string> = {
  "pending-approval": "Pending approval",
  "awaiting-input": "Awaiting input",
  "plan-ready": "Plan ready",
  working: "Working",
  connecting: "Connecting",
  monitoring: "Monitoring",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
};

type ShellLike = Pick<
  OrchestrationThreadShell,
  | "archivedAt"
  | "snoozedUntil"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "hasActionableProposedPlan"
  | "interactionMode"
  | "latestTurn"
  | "session"
  | "backgroundLiveness"
  | "updatedAt"
>;

function isSnoozed(shell: ShellLike, nowMs: number): boolean {
  if (!shell.snoozedUntil) return false;
  const until = Date.parse(shell.snoozedUntil);
  return !Number.isNaN(until) && until > nowMs;
}

/**
 * Classify one shell. Returns null for threads that do not belong on the
 * board: archived, snoozed, idle with no recent completion.
 */
export function classifyDashboardThread<Shell extends OrchestrationThreadShell>(
  shell: Shell,
  now: string,
): DashboardEntry<Shell> | null {
  const nowMs = Date.parse(now);
  const snoozedNow = isSnoozed(shell, nowMs);
  if (shell.archivedAt !== null) return null;
  // Snoozed threads that raise a hand still surface: the user asked to be
  // left alone, not to miss an approval.
  const turn = shell.latestTurn;

  if (shell.hasPendingApprovals) {
    return { shell, lane: "needs-you", reason: "pending-approval", since: shell.updatedAt };
  }
  if (shell.hasPendingUserInput) {
    return { shell, lane: "needs-you", reason: "awaiting-input", since: shell.updatedAt };
  }
  if (snoozedNow || shell.settledOverride === "settled") return null;

  const sessionStatus = shell.session?.status;
  if (sessionStatus === "running" || turn?.state === "running") {
    return {
      shell,
      lane: "running",
      reason: "working",
      since:
        turn && turn.completedAt === null
          ? (turn.startedAt ?? turn.requestedAt ?? shell.updatedAt)
          : (shell.session?.updatedAt ?? shell.updatedAt),
    };
  }
  if (sessionStatus === "starting") {
    return { shell, lane: "running", reason: "connecting", since: shell.updatedAt };
  }
  if (
    shell.interactionMode === "plan" &&
    shell.hasActionableProposedPlan &&
    turn?.state === "completed" &&
    turn.completedAt !== null
  ) {
    return {
      shell,
      lane: "needs-you",
      reason: "plan-ready",
      since: turn?.completedAt ?? shell.updatedAt,
    };
  }
  if (shell.backgroundLiveness === "working") {
    return { shell, lane: "running", reason: "working", since: shell.updatedAt };
  }
  if (shell.backgroundLiveness === "monitoring") {
    return { shell, lane: "monitoring", reason: "monitoring", since: shell.updatedAt };
  }

  if (turn?.completedAt) {
    const completedMs = Date.parse(turn.completedAt);
    if (!Number.isNaN(completedMs) && nowMs - completedMs <= DASHBOARD_DONE_WINDOW_MS) {
      const reason: DashboardReason =
        turn.state === "error"
          ? "failed"
          : turn.state === "interrupted"
            ? "interrupted"
            : "completed";
      return {
        shell,
        lane: reason === "completed" ? "done" : "needs-you",
        reason,
        since: turn.completedAt,
      };
    }
  }
  return null;
}

export interface DashboardBoard<Shell extends OrchestrationThreadShell = OrchestrationThreadShell> {
  readonly lanes: Readonly<Record<DashboardLane, ReadonlyArray<DashboardEntry<Shell>>>>;
  readonly counts: Readonly<Record<DashboardLane, number>>;
}

const compareSince = (a: DashboardEntry, b: DashboardEntry) =>
  Date.parse(a.since) - Date.parse(b.since);

/**
 * Build the board. Needs-you sorts longest wait first; running, monitoring
 * and done sort most recent first.
 */
export function buildDashboard<Shell extends OrchestrationThreadShell>(
  shells: ReadonlyArray<Shell>,
  now: string,
): DashboardBoard<Shell> {
  const lanes: Record<DashboardLane, DashboardEntry<Shell>[]> = {
    "needs-you": [],
    running: [],
    monitoring: [],
    done: [],
  };
  for (const shell of shells) {
    const entry = classifyDashboardThread(shell, now);
    if (entry) lanes[entry.lane].push(entry);
  }
  lanes["needs-you"].sort(compareSince);
  lanes.running.sort((a, b) => compareSince(b, a));
  lanes.monitoring.sort((a, b) => compareSince(b, a));
  lanes.done.sort((a, b) => compareSince(b, a));
  return {
    lanes,
    counts: {
      "needs-you": lanes["needs-you"].length,
      running: lanes.running.length,
      monitoring: lanes.monitoring.length,
      done: lanes.done.length,
    },
  };
}

export function isEscalated(entry: DashboardEntry, now: string): boolean {
  if (entry.lane !== "needs-you") return false;
  const waited = Date.parse(now) - Date.parse(entry.since);
  return !Number.isNaN(waited) && waited >= DASHBOARD_WAITING_ESCALATION_MS;
}

export type DashboardHistoryView = "snoozed" | "settled" | "archived";

/** Lifecycle lists include idle chats and old results, independent of agent status. */
export function dashboardHistory<Shell extends OrchestrationThreadShell>(
  shells: ReadonlyArray<Shell>,
  now: string,
  view: DashboardHistoryView,
): Shell[] {
  const nowMs = Date.parse(now);
  return shells
    .filter((shell) => {
      if (view === "archived") return shell.archivedAt !== null;
      if (shell.archivedAt !== null) return false;
      return view === "snoozed" ? isSnoozed(shell, nowMs) : shell.settledOverride === "settled";
    })
    .sort((a, b) => {
      if (view === "snoozed") return a.snoozedUntil!.localeCompare(b.snoozedUntil!);
      const timestamp = (shell: Shell) =>
        (view === "archived" ? shell.archivedAt : shell.settledAt) ?? shell.updatedAt;
      return timestamp(b).localeCompare(timestamp(a));
    });
}
