import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { DashboardHistoryView } from "@t3tools/client-runtime/state/dashboard";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { snoozeWakeLabel } from "../Sidebar.snooze";
import { Button } from "../ui/button";

export function DashboardHistoryRow({
  shell,
  view,
  now,
  projectTitle,
  spaceName,
  projectCwd,
  deviceLabel,
  provider,
  connected,
  onRestore,
}: {
  shell: EnvironmentThreadShell;
  view: DashboardHistoryView;
  now: string;
  projectTitle: string;
  spaceName?: string | undefined;
  projectCwd: string;
  deviceLabel: string;
  provider: ProviderInstanceEntry | undefined;
  connected: boolean;
  onRestore: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const action = view === "archived" ? "Restore" : view === "settled" ? "Reopen" : "Unsnooze";
  const time =
    view === "snoozed"
      ? `Returns in ${snoozeWakeLabel(shell.snoozedUntil!, { now })}`
      : `${view === "archived" ? "Archived" : "Settled"} ${formatRelativeTimeLabel((view === "archived" ? shell.archivedAt : shell.settledAt) ?? shell.updatedAt)}`;
  return (
    <li className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0">
      <Link
        to="/$environmentId/$threadId"
        params={{ environmentId: shell.environmentId, threadId: shell.id }}
        className="min-w-0 flex-1 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="truncate text-[13px] font-medium">{shell.title}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <Tooltip>
            <TooltipTrigger render={<span className="max-w-40 truncate" />}>
              {projectTitle}
              {spaceName ? ` · ${spaceName}` : ""}
            </TooltipTrigger>
            <TooltipPopup>{projectCwd}</TooltipPopup>
          </Tooltip>
          <span>
            {deviceLabel}
            {connected ? "" : " (offline)"}
          </span>
          {provider ? (
            <span className="inline-flex items-center gap-1">
              <ProviderInstanceIcon
                driverKind={provider.driverKind}
                displayName={provider.displayName}
                iconClassName="size-3"
              />
              {provider.displayName}
            </span>
          ) : null}
          {shell.branch ? (
            <Tooltip>
              <TooltipTrigger render={<span className="max-w-48 truncate" />}>
                {shell.branch}
              </TooltipTrigger>
              <TooltipPopup>{shell.branch}</TooltipPopup>
            </Tooltip>
          ) : null}
          {shell.latestTurn ? (
            <span className="capitalize">Last turn: {shell.latestTurn.state}</span>
          ) : null}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <Tooltip>
          <TooltipTrigger render={<span className="text-[11px] text-muted-foreground" />}>
            {time}
          </TooltipTrigger>
          <TooltipPopup>
            {new Date(
              (view === "snoozed"
                ? shell.snoozedUntil
                : view === "archived"
                  ? shell.archivedAt
                  : shell.settledAt) ?? shell.updatedAt,
            ).toLocaleString()}
          </TooltipPopup>
        </Tooltip>
        <Button
          size="xs"
          variant="outline"
          className="h-7 text-xs"
          disabled={!connected || pending}
          onClick={async () => {
            setPending(true);
            try {
              await onRestore();
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Updating..." : action}
        </Button>
      </div>
    </li>
  );
}
