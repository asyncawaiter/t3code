import type {
  EnvironmentId,
  ProviderInstanceId,
  UsageProviderKind,
  UsageProviderLimits,
  ServerProvider,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { useAtomCommand } from "../../state/use-atom-command";
import { CalendarDaysIcon, Clock3Icon, CpuIcon } from "lucide-react";

import { serverEnvironment } from "../../state/server";
import { PROVIDER_PRESENTATION, ProviderMark } from "../usage/usageProviders";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { composerFloatingLayerProps } from "./composerEventScope";

function usedPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function windowIcon(window: UsageProviderLimits["windows"][number]) {
  if (window.id.startsWith("seven_day_")) return CpuIcon;
  return (window.windowMinutes ?? 0) >= 1440 || window.id === "seven_day"
    ? CalendarDaysIcon
    : Clock3Icon;
}

function triggerLabel(provider: UsageProviderKind, limits: UsageProviderLimits | null): string {
  const label = PROVIDER_PRESENTATION[provider].label;
  if (!limits || limits.windows.length === 0) return `${label} limits`;
  return `${label} limits: ${limits.windows
    .map((window) => `${window.label} ${Math.round(window.usedPercent)}% used`)
    .join(", ")}`;
}

function LimitsPopover({
  provider,
  limits,
  failed,
  pending,
  now,
}: {
  readonly provider: UsageProviderKind;
  readonly limits: UsageProviderLimits | null;
  readonly failed: boolean;
  readonly pending: boolean;
  readonly now: number;
}) {
  const label = PROVIDER_PRESENTATION[provider].label;
  return (
    <div className="flex flex-col gap-3.5 p-[var(--floating-content-inset)]">
      <div className="flex min-w-0 items-center gap-2">
        <ProviderMark provider={provider} className="size-4" />
        <span className="truncate font-medium text-sm text-foreground">{label} limits</span>
        {limits?.plan ? (
          <span className="ms-auto truncate text-xs text-secondary-label">{limits.plan}</span>
        ) : null}
      </div>

      {failed || limits?.readError ? (
        <span className="text-xs text-secondary-label">Could not refresh limits.</span>
      ) : null}

      {limits?.windows.length ? (
        <div className="flex flex-col gap-3">
          {limits.windows.map((window) => {
            const percent = usedPercent(window.usedPercent);
            const Icon = windowIcon(window);
            const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN;
            return (
              <div key={window.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-secondary-label">
                    <Icon aria-hidden className="size-3 shrink-0" />
                    <span className="truncate">{window.label}</span>
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {Math.round(window.usedPercent)}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted/60"
                  role="progressbar"
                  aria-label={`${window.label} usage`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${percent}%`,
                      backgroundColor:
                        percent > 90 ? "var(--color-error)" : PROVIDER_PRESENTATION[provider].color,
                    }}
                  />
                </div>
                {Number.isFinite(resetAt) ? (
                  <span className="text-[11px] tabular-nums text-secondary-label">
                    Resets in {formatDuration(resetAt - now)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-xs text-secondary-label">
          {failed || limits?.readError
            ? "Limits unavailable."
            : pending
              ? "Reading limits..."
              : "No limits reported."}
        </span>
      )}

      {limits?.resetCredits && limits.resetCredits.availableCount > 0 ? (
        <span className="text-xs tabular-nums text-secondary-label">
          {limits.resetCredits.availableCount} banked{" "}
          {limits.resetCredits.availableCount === 1 ? "reset" : "resets"}
        </span>
      ) : null}
    </div>
  );
}

export function UsageLimitsMeter({
  environmentId,
  instanceId,
  provider,
  snapshot,
  plan,
  isRunning = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: UsageProviderKind;
  readonly snapshot: ServerProvider["usageLimits"];
  readonly plan?: string | undefined;
  readonly isRunning?: boolean;
}) {
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const refresh = () => {
    void refreshProviders({ environmentId, input: { instanceId, usageOnly: true } });
  };
  useLiveRefresh(refresh, {
    key: `usage:${environmentId}:${instanceId}`,
    // Turns stream fresh windows and every finished turn re-reads, so this only
    // catches usage from elsewhere (another device, the web) while idle.
    intervalMs: 60_000,
    idleAfterMs: Infinity,
  });
  useEffect(() => {
    if (!isRunning && document.visibilityState === "visible") {
      void refreshProviders({ environmentId, input: { instanceId, usageOnly: true } });
    }
  }, [environmentId, instanceId, isRunning, refreshProviders]);
  const [now, setNow] = useState(Date.now);
  const usage = snapshot;
  const limits: UsageProviderLimits | null = usage
    ? {
        instanceId,
        provider,
        instanceLabel: null,
        plan: plan ?? null,
        windows: usage.windows.map((window) => ({
          id: window.id,
          label: window.label,
          usedPercent: window.usedPercent,
          windowMinutes: window.windowDurationMins ?? null,
          resetsAt: window.resetsAt ?? null,
        })),
        resetCredits: usage.resetCredits
          ? {
              availableCount: usage.resetCredits.availableCount,
              nextExpiresAt: usage.resetCredits.nextExpiresAt ?? null,
            }
          : null,
        observedAt: usage.checkedAt,
        readError: usage.unavailable?.reason === "probeFailed" ? "Could not refresh limits." : null,
      }
    : null;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setNow(Date.now());
          refresh();
        }
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <Button
            size="sm"
            variant="ghost-muted"
            className="h-7 shrink-0 gap-2.5 rounded-md px-1.5 text-[10px] tabular-nums hover:text-foreground data-pressed:text-foreground [&_svg]:mx-0"
            aria-label={triggerLabel(provider, limits)}
          >
            <ProviderMark provider={provider} className="size-3.5" />
            {limits?.windows.length ? (
              limits.windows.map((window) => {
                const percent = Math.round(usedPercent(window.usedPercent));
                const Icon = windowIcon(window);
                return (
                  <span
                    key={window.id}
                    className="inline-flex items-center gap-1 leading-none"
                    aria-label={`${window.label}: ${percent}% used`}
                  >
                    <Icon aria-hidden className="size-3 text-secondary-label" />
                    <span className={percent > 90 ? "text-error" : ""}>{`${percent}%`}</span>
                  </span>
                );
              })
            ) : (
              <span>--</span>
            )}
          </Button>
        }
      />
      <PopoverPopup
        {...composerFloatingLayerProps}
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-72 max-w-none text-left whitespace-normal"
      >
        <LimitsPopover
          provider={provider}
          limits={limits}
          failed={false}
          pending={!usage}
          now={now}
        />
      </PopoverPopup>
    </Popover>
  );
}
