import type { EnvironmentMachineKind, ProjectIconOverride } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { GitBranchIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { DASHBOARD_REASON_LABELS, isEscalated } from "@t3tools/client-runtime/state/dashboard";
import { formatElapsedDurationLabel, formatRelativeTimeLabel } from "../../timestampFormat";
import { buildThreadTurnInterruptInput } from "../ChatView.logic";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import { DashboardApprovalActions } from "./DashboardApprovalActions";
import type { DashboardBoardEntry } from "./DashboardPage.logic";

const REASON_COLOR_CLASS: Record<DashboardBoardEntry["reason"], string> = {
  "pending-approval": "text-amber-600 dark:text-amber-300/90 bg-amber-500/10",
  "awaiting-input": "text-indigo-600 dark:text-indigo-300/90 bg-indigo-500/10",
  "plan-ready": "text-violet-600 dark:text-violet-300/90 bg-violet-500/10",
  working: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  connecting: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  monitoring: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  completed: "text-emerald-600 dark:text-emerald-300/90 bg-emerald-500/10",
  failed: "text-destructive-foreground bg-destructive/10",
  interrupted: "text-muted-foreground bg-muted-foreground/10",
};

function dashboardTimeLabel(entry: DashboardBoardEntry, nowMs: number): string {
  const elapsed = formatElapsedDurationLabel(entry.since, nowMs);
  switch (entry.lane) {
    case "needs-you":
      return elapsed === "just now" ? "Waiting" : `Waiting ${elapsed}`;
    case "running":
      return elapsed === "just now" ? "Running" : `Running ${elapsed}`;
    case "monitoring":
      return elapsed === "just now" ? "Since just now" : `Since ${elapsed}`;
    case "done":
      return formatRelativeTimeLabel(entry.since);
  }
}

export const DashboardCard = memo(function DashboardCard({
  entry,
  now,
  projectTitle,
  projectCwd,
  projectFaviconPath,
  projectIcon,
  showMachineIcon,
  machineKind,
}: {
  readonly entry: DashboardBoardEntry;
  readonly now: string;
  readonly projectTitle: string;
  readonly projectCwd: string;
  readonly projectFaviconPath: string | null | undefined;
  readonly projectIcon: ProjectIconOverride | null | undefined;
  readonly showMachineIcon: boolean;
  readonly machineKind: EnvironmentMachineKind | null;
}) {
  const navigate = useNavigate();
  const { shell } = entry;
  const environmentId = shell.environmentId;
  const threadId = shell.id;
  const nowMs = Date.parse(now);
  const escalated = isEscalated(entry, now);

  const openThread = useCallback(() => {
    void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
  }, [environmentId, navigate, threadId]);

  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn);
  const [stopping, setStopping] = useState(false);
  const isRunning = shell.session?.status === "running";
  async function onStop(event: React.MouseEvent) {
    event.stopPropagation();
    setStopping(true);
    await interruptTurn({
      environmentId,
      input: buildThreadTurnInterruptInput(shell),
    });
    setStopping(false);
  }

  const stopClick = (event: React.MouseEvent) => void onStop(event);
  const openClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    openThread();
  };

  let actions: React.ReactNode;
  if (entry.reason === "pending-approval") {
    actions = (
      <div onClick={(event) => event.stopPropagation()}>
        <DashboardApprovalActions environmentId={environmentId} threadId={threadId} />
      </div>
    );
  } else if (entry.reason === "awaiting-input") {
    actions = (
      <Button size="micro" variant="ghost-muted" onClick={openClick}>
        Answer
      </Button>
    );
  } else if (entry.reason === "plan-ready") {
    actions = (
      <Button size="micro" variant="ghost-muted" onClick={openClick}>
        Review plan
      </Button>
    );
  } else if (isRunning) {
    actions = (
      <Button size="micro" variant="ghost-muted" disabled={stopping} onClick={stopClick}>
        Stop
      </Button>
    );
  } else {
    actions = null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openThread}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openThread();
        }
      }}
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm",
        escalated && "ring-1 ring-amber-500/60 dark:ring-amber-400/50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/80">
          <ProjectFavicon
            environmentId={environmentId}
            cwd={projectCwd}
            projectName={projectTitle}
            faviconPath={projectFaviconPath}
            projectIcon={projectIcon}
            className="size-3 shrink-0"
          />
          <span className="min-w-0 truncate">{projectTitle}</span>
          {showMachineIcon && machineKind ? (
            <EnvironmentMachineIcon kind={machineKind} className="size-3 shrink-0" />
          ) : null}
        </div>
        <div className="min-w-0 truncate font-medium text-foreground">{shell.title}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-medium",
              REASON_COLOR_CLASS[entry.reason],
            )}
          >
            {DASHBOARD_REASON_LABELS[entry.reason]}
          </span>
          <span className="shrink-0">{dashboardTimeLabel(entry, nowMs)}</span>
          {shell.branch ? (
            <span className="flex min-w-0 shrink items-center gap-1">
              <GitBranchIcon className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{shell.branch}</span>
            </span>
          ) : null}
          {entry.lane === "running" && shell.planProgress?.step ? (
            <span className="min-w-0 truncate">{shell.planProgress.step}</span>
          ) : null}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        {actions}
        <Button size="micro" variant="ghost-muted" onClick={openClick}>
          Open
        </Button>
      </div>
    </div>
  );
});
