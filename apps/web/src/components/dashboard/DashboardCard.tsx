import { workItemStage } from "@t3tools/contracts";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { openWorkItem, type LocatedWorkItem } from "../../workItems";
import { useWorkflowState } from "../../workflowState";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useLinkedThreadPullRequest } from "../ThreadStatusIndicators";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { EnvironmentMachineKind } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronUpIcon, GitBranchIcon, MonitorIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import { DASHBOARD_REASON_LABELS, isEscalated } from "@t3tools/client-runtime/state/dashboard";
import { formatElapsedDurationLabel, formatRelativeTimeLabel } from "../../timestampFormat";
import { buildThreadTurnInterruptInput } from "../ChatView.logic";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { DashboardApprovalActions } from "./DashboardApprovalActions";
import type { DashboardBoardEntry } from "./DashboardPage.logic";

const REASON_COLOR_CLASS: Record<DashboardBoardEntry["reason"], string> = {
  "pending-approval": "text-amber-600 dark:text-amber-300/90 bg-amber-500/10",
  "awaiting-input": "text-indigo-600 dark:text-indigo-300/90 bg-indigo-500/10",
  "plan-ready": "text-violet-600 dark:text-violet-300/90 bg-violet-500/10",
  working: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  connecting: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  monitoring: "text-sky-600 dark:text-sky-300/80 bg-sky-500/10",
  idle: "text-muted-foreground bg-muted-foreground/10",
  reviewed: "text-muted-foreground bg-muted-foreground/10",
  completed: "text-emerald-600 dark:text-emerald-300/90 bg-emerald-500/10",
  failed: "text-destructive bg-destructive/10",
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
    case "idle":
    case "done":
      return formatRelativeTimeLabel(entry.since);
  }
}

const NO_TASKS: LocatedWorkItem[] = [];

export const DashboardCard = memo(function DashboardCard({
  entry,
  detailed = false,
  tasks = NO_TASKS,
  onOpen,
  opening = false,
  unread,
  now,
  project,
  spaceName,
  showMachineIcon,
  machineKind,
  providerEntry,
  deviceLabel,
  connected,
}: {
  detailed?: boolean;
  tasks?: LocatedWorkItem[] | undefined;
  onOpen: () => void;
  opening?: boolean;
  readonly unread: boolean;
  readonly entry: DashboardBoardEntry;
  readonly now: string;
  readonly project: ProjectFaviconProject;
  spaceName?: string | undefined;
  readonly showMachineIcon: boolean;
  readonly machineKind: EnvironmentMachineKind | null;
  readonly providerEntry: ProviderInstanceEntry | undefined;
  readonly deviceLabel: string;
  readonly connected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const showDetails = detailed || expanded;
  const navigate = useNavigate();
  const reviewed = useWorkflowState((s) => s.reviewed);
  const kept = useWorkflowState((s) => s.kept);
  const review = useWorkflowState((s) => s.review);
  const { shell } = entry;
  const environmentId = shell.environmentId;
  const threadId = shell.id;
  const linkedStatus = useLinkedThreadPullRequest(
    connected ? environmentId : null,
    shell.linkedPullRequest,
  );
  const nowMs = Date.parse(now);
  const escalated = entry.lane !== "idle" && isEscalated(entry, now);

  const openThread = useCallback(() => {
    if (!opening) onOpen();
  }, [opening, onOpen]);

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
    actions = <span className="text-xs text-muted-foreground">Archived</span>;
  } else if (!connected) {
    actions = (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} className="text-xs text-muted-foreground" />}>
          Offline
        </TooltipTrigger>
        <TooltipPopup>Offline, showing last known state</TooltipPopup>
      </Tooltip>
    );
  } else if (entry.reason === "pending-approval") {
    actions = (
      <div onClick={(event) => event.stopPropagation()}>
        <DashboardApprovalActions environmentId={environmentId} threadId={threadId} />
      </div>
    );
  } else if (entry.reason === "awaiting-input") {
    actions = (
      <Button size="xs" variant="outline" onClick={openClick}>
        Answer
      </Button>
    );
  } else if (entry.reason === "plan-ready") {
    actions = (
      <Button size="xs" variant="outline" onClick={openClick}>
        Review plan
      </Button>
    );
  } else if (isRunning) {
    actions = (
      <Button size="micro" variant="ghost-muted" disabled={stopping} onClick={stopClick}>
        Stop
      </Button>
    );
  } else if (entry.lane === "done" || entry.reason === "reviewed") {
    const key = scopedThreadKey(scopeThreadRef(environmentId, threadId));
    const isReviewed = reviewed[key] === entry.since;
    actions = (
      <Button
        size="micro"
        variant="ghost-muted"
        onClick={(event) => {
          event.stopPropagation();
          review(key, entry.since, isReviewed);
        }}
      >
        {isReviewed ? "Keep for review" : "Mark reviewed"}
      </Button>
    );
  } else {
    actions = null;
  }

  return (
    <div
      role="button"
      data-dashboard-chat-key={`${environmentId}:${threadId}`}
      aria-busy={opening}
      tabIndex={0}
      onClick={openThread}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openThread();
        }
      }}
      className={cn(
        "group relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2.5 text-xs outline-none hover:border-foreground/25 hover:bg-[color-mix(in_srgb,var(--sidebar-row-active)_18%,var(--card))] focus-visible:ring-2 focus-visible:ring-ring",
        escalated && "ring-1 ring-amber-500/60 dark:ring-amber-400/50",
      )}
    >
      {opening && (
        <span role="status" className="text-xs text-muted-foreground">
          Opening...
        </span>
      )}
      <div className="flex min-w-0 items-start gap-2">
        {unread ? (
          <span aria-label="Unread" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
        ) : null}
        <div className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-[18px] text-foreground">
          {shell.title}
        </div>
        {!detailed && (
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={expanded ? "Collapse chat details" : "Expand chat details"}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-medium",
              REASON_COLOR_CLASS[entry.reason],
            )}
          >
            {entry.reason === "idle"
              ? "Idle"
              : entry.reason === "reviewed"
                ? "Reviewed"
                : DASHBOARD_REASON_LABELS[entry.reason]}
          </span>
          <span className="shrink-0">{dashboardTimeLabel(entry, nowMs)}</span>
          {entry.lane === "done" &&
          kept[scopedThreadKey(scopeThreadRef(environmentId, threadId))] === entry.since ? (
            <span>Kept for review</span>
          ) : null}
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
          {actions ? (
            <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
          {entry.lane === "running" && shell.planProgress?.step ? (
            <span className="min-w-0 truncate">{shell.planProgress.step}</span>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 text-xs",
          !showDetails &&
            "absolute inset-x-1 bottom-1 z-10 rounded-md border border-border/60 bg-card px-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {tasks.length ? (
          <Menu>
            <MenuTrigger render={<Button size="xs" variant="ghost" />}>
              {tasks.length === 1 ? "Task details" : `${tasks.length} tasks`}
            </MenuTrigger>
            <MenuPopup align="start">
              {tasks.map((task) => (
                <MenuItem
                  key={`${task.environmentId}:${task.item.id}`}
                  onClick={() => openWorkItem(task)}
                >
                  {task.item.title}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          aria-label="Create task from this chat"
          onClick={() =>
            openWorkItem({
              environmentId,
              projectId: shell.projectId,
              source: { environmentId, threadId },
            })
          }
        >
          New task
        </Button>
        {tasks.length === 1 && (
          <span className="capitalize text-muted-foreground">{workItemStage(tasks[0]!.item)}</span>
        )}
      </div>
      {showDetails ? (
        <>
          <dl className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-xs">
            <dt className="text-[11px] text-muted-foreground">Space</dt>
            <dd className="min-w-0">
              <Tooltip>
                <TooltipTrigger
                  render={<span tabIndex={0} className="block truncate text-foreground/85" />}
                >
                  {spaceName ?? "Unsorted"}
                </TooltipTrigger>
                <TooltipPopup>Space: {spaceName ?? "Unsorted"}</TooltipPopup>
              </Tooltip>
            </dd>
            <dt className="text-[11px] text-muted-foreground">Project</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-foreground/85">
              <ProjectFavicon project={project} className="size-3.5 shrink-0" />
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="min-w-0 flex-1 truncate" />}>
                  {project.title}
                </TooltipTrigger>
                <TooltipPopup>{project.title}</TooltipPopup>
              </Tooltip>
              {shell.branch ? (
                <span className="flex min-w-0 max-w-[45%] items-center gap-1 text-[11px] text-muted-foreground">
                  <GitBranchIcon className="size-3 shrink-0" />
                  <span className="truncate">{shell.branch}</span>
                </span>
              ) : null}
            </dd>
            <dt className="text-[11px] text-muted-foreground">Path</dt>
            <dd className="min-w-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      className="block truncate text-[11px] text-muted-foreground"
                    />
                  }
                >
                  {shell.worktreePath ?? project.workspaceRoot}
                </TooltipTrigger>
                <TooltipPopup className="break-all">
                  {shell.worktreePath ?? project.workspaceRoot}
                </TooltipPopup>
              </Tooltip>
            </dd>
          </dl>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger
                render={<span tabIndex={0} className="flex min-w-0 flex-1 items-center gap-1.5" />}
              >
                {showMachineIcon && machineKind ? (
                  <EnvironmentMachineIcon kind={machineKind} className="size-3.5 shrink-0" />
                ) : (
                  <MonitorIcon className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{deviceLabel}</span>
                {!connected ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                ) : null}
              </TooltipTrigger>
              <TooltipPopup>
                {deviceLabel}
                {!connected ? " · Offline, showing last known state" : ""}
              </TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    className="ml-auto flex min-w-0 flex-1 justify-end items-center gap-1.5"
                  />
                }
              >
                {providerEntry ? (
                  <ProviderInstanceIcon
                    driverKind={providerEntry.driverKind}
                    displayName={providerEntry.displayName}
                    iconClassName="size-3.5 shrink-0"
                  />
                ) : null}
                <span className="truncate">
                  {providerEntry?.displayName ?? shell.modelSelection.model}
                </span>
              </TooltipTrigger>
              <TooltipPopup>
                <div>
                  {providerEntry?.displayName ?? shell.modelSelection.instanceId} ·{" "}
                  {shell.modelSelection.model}
                </div>
                <div>{providerEntry?.snapshot.auth.email ?? "Account details unavailable"}</div>
              </TooltipPopup>
            </Tooltip>
          </div>
        </>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <ProjectFavicon project={project} className="size-3 shrink-0" />
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="min-w-0 flex-1 truncate" />}>
              {spaceName ?? "Unsorted"}
              {project.title && project.title !== spaceName ? ` / ${project.title}` : ""}
            </TooltipTrigger>
            <TooltipPopup>
              <div>
                {spaceName ?? "Unsorted"} / {project.title}
              </div>
              <div>{deviceLabel}</div>
              <div className="break-all">{shell.worktreePath ?? project.workspaceRoot}</div>
            </TooltipPopup>
          </Tooltip>
          {providerEntry && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label={`${providerEntry.displayName} on ${deviceLabel}`}
                  />
                }
              >
                <ProviderInstanceIcon
                  driverKind={providerEntry.driverKind}
                  displayName={providerEntry.displayName}
                  iconClassName="size-3.5 shrink-0"
                />
              </TooltipTrigger>
              <TooltipPopup>
                {providerEntry.displayName} / {deviceLabel}
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
});
