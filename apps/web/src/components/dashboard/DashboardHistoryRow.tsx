import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { DashboardHistoryView } from "@t3tools/client-runtime/state/dashboard";
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
  onOpen,
  opening,
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
  onOpen: () => void;
  opening: boolean;
}) {
  const [pending, setPending] = useState(false);
  const action = view === "archived" ? "Restore" : view === "settled" ? "Unsettle" : "Unsnooze";
  const time =
    view === "snoozed"
      ? `Returns in ${snoozeWakeLabel(shell.snoozedUntil!, { now })}`
      : `${view === "archived" ? "Archived" : "Settled"} ${formatRelativeTimeLabel((view === "archived" ? shell.archivedAt : shell.settledAt) ?? shell.updatedAt)}`;
  return (
    <li className="surface-raised-sm flex items-center gap-4 rounded-xl px-4 py-3">
      <button
        type="button"
        data-dashboard-chat-key={`${shell.environmentId}:${shell.id}`}
        onClick={onOpen}
        aria-busy={opening}
        className="min-w-0 flex-1 rounded-sm text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="truncate text-sm font-medium">{opening ? "Opening..." : shell.title}</div>
        <div className="mt-1 flex min-w-0 items-center gap-x-2.5 overflow-hidden text-xs text-foreground/65">
          <Tooltip>
            <TooltipTrigger render={<span className="max-w-40 truncate" />}>
              {projectTitle}
              {spaceName ? ` · ${spaceName}` : ""}
            </TooltipTrigger>
            <TooltipPopup>{projectCwd}</TooltipPopup>
          </Tooltip>
          <span className="min-w-0 truncate">
            {deviceLabel}
            {connected ? "" : " (offline)"}
          </span>
          {provider ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <ProviderInstanceIcon
                driverKind={provider.driverKind}
                displayName={provider.displayName}
                iconClassName="size-3.5"
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
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Tooltip>
          <TooltipTrigger render={<span className="text-xs text-foreground/65 tabular-nums" />}>
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
