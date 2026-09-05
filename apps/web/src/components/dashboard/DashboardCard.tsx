import { useLinkedThreadPullRequest } from "../ThreadStatusIndicators";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
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
  if (entry.reason === "failed" || entry.reason === "interrupted")
    return formatRelativeTimeLabel(entry.since);
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
  unread,
  now,
  projectTitle,
  spaceName,
  projectCwd,
  projectFaviconPath,
  projectIcon,
  showMachineIcon,
  machineKind,
  providerEntry,
  deviceLabel,
  connected,
}: {
  readonly unread: boolean;
  readonly entry: DashboardBoardEntry;
  readonly now: string;
  readonly projectTitle: string;
  spaceName?: string | undefined;
  readonly projectCwd: string;
  readonly projectFaviconPath: string | null | undefined;
  readonly projectIcon: ProjectIconOverride | null | undefined;
  readonly showMachineIcon: boolean;
  readonly machineKind: EnvironmentMachineKind | null;
  readonly providerEntry: ProviderInstanceEntry | undefined;
  readonly deviceLabel: string;
  readonly connected: boolean;
}) {
  const navigate = useNavigate();
  const { shell } = entry;
  const environmentId = shell.environmentId;
  const threadId = shell.id;
  const linkedStatus = useLinkedThreadPullRequest(
    connected ? environmentId : null,
    shell.linkedPullRequest,
  );
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
    try {
      await interruptTurn({
        environmentId,
        input: buildThreadTurnInterruptInput(shell),
      });
    } finally {
      setStopping(false);
    }
  }

  const stopClick = (event: React.MouseEvent) => void onStop(event);
  const openClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    openThread();
  };

  let actions: React.ReactNode;
  if (shell.archivedAt !== null) {
    actions = <span className="text-[11px] text-muted-foreground">Archived</span>;
  } else if (!connected) {
    actions = (
      <span className="text-[11px] text-muted-foreground">Offline, showing last known state</span>
    );
  } else if (entry.reason === "pending-approval") {
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
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openThread();
        }
      }}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-2.5 text-xs outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring",
        escalated && "ring-1 ring-amber-500/60 dark:ring-amber-400/50",
      )}
    >
      <div className="flex w-full min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/80">
          {unread ? (
            <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-blue-500" />
          ) : null}
          <ProjectFavicon
            environmentId={environmentId}
            cwd={projectCwd}
            projectName={projectTitle}
            faviconPath={projectFaviconPath}
            projectIcon={projectIcon}
            className="size-3 shrink-0"
          />
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
              {projectTitle}
              {spaceName ? ` · ${spaceName}` : ""}
            </TooltipTrigger>
            <TooltipPopup>{projectCwd}</TooltipPopup>
          </Tooltip>
          {showMachineIcon && machineKind ? (
            <EnvironmentMachineIcon kind={machineKind} className="size-3 shrink-0" />
          ) : null}
          <Tooltip>
            <TooltipTrigger render={<span className="max-w-24 truncate text-[10px]" />}>
              {deviceLabel}
            </TooltipTrigger>
            <TooltipPopup>{deviceLabel}</TooltipPopup>
          </Tooltip>
        </div>
        <div className="line-clamp-2 min-w-0 text-[13px] font-medium leading-5 text-foreground">
          {shell.title}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-medium",
              REASON_COLOR_CLASS[entry.reason],
            )}
          >
            {DASHBOARD_REASON_LABELS[entry.reason]}
          </span>
          <span className="shrink-0">{dashboardTimeLabel(entry, nowMs)}</span>
          {shell.linkedPullRequest ? (
            <Button
              size="micro"
              variant="ghost-muted"
              onClick={(event) => {
                event.stopPropagation();
                const pr = shell.linkedPullRequest!;
                void navigate({
                  to: "/pull-requests",
                  search: {
                    involvement: "all",
                    state: "all",
                    environmentId,
                    projectId: pr.projectId,
                    selectedEnvironmentId: environmentId,
                    selectedProjectId: pr.projectId,
                    repository: pr.repository,
                    number: pr.number,
                  },
                });
              }}
            >
              #{shell.linkedPullRequest.number} ·{" "}
              {connected && linkedStatus ? linkedStatus.pr.state : "Status unavailable"}
            </Button>
          ) : null}
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
      <div className="flex w-full shrink-0 items-center justify-between gap-1.5 border-t border-border/60 pt-1.5">
        {actions}
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          {providerEntry ? (
            <>
              <ProviderInstanceIcon
                driverKind={providerEntry.driverKind}
                displayName={providerEntry.displayName}
                iconClassName="size-3"
              />
              {providerEntry.displayName}
            </>
          ) : (
            shell.modelSelection.model
          )}
        </span>
      </div>
    </div>
  );
});
