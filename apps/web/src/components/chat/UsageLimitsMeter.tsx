import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ProviderInstanceId,
  UsageProviderKind,
  UsageProviderLimits,
} from "@t3tools/contracts";
import { formatDuration, resetMillis } from "@t3tools/shared/usageLimits";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { PROVIDER_PRESENTATION, ProviderMark } from "../usage/usageProviders";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { composerFloatingLayerProps } from "./composerEventScope";

function usedPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function triggerLabel(provider: UsageProviderKind, limits: UsageProviderLimits | null): string {
  const label = PROVIDER_PRESENTATION[provider].label;
  if (!limits || limits.windows.length === 0) return `${label} limits`;
  return `${label} limits: ${limits.windows
    .map((window) => `${window.label} ${Math.round(window.usedPercent)}%`)
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
            const resetAt = resetMillis(window);
            return (
              <div key={window.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-secondary-label">{window.label}</span>
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
                {resetAt !== null ? (
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
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: UsageProviderKind;
}) {
  const result = useAtomValue(serverEnvironment.usageLimits({ environmentId, input: {} }));
  const [now] = useState(Date.now);
  const snapshot = Option.getOrNull(AsyncResult.value(result));
  const limits =
    snapshot?.providers.find(
      (entry) => entry.instanceId === instanceId && entry.provider === provider,
    ) ?? null;
  const highestUsedPercent = limits?.windows.length
    ? Math.round(Math.max(...limits.windows.map((window) => usedPercent(window.usedPercent))))
    : null;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <Button
            size="sm"
            variant="ghost-muted"
            className="h-7 min-w-12 gap-1.5 rounded-full bg-muted/50 px-2 text-[11px] tabular-nums hover:text-foreground data-pressed:text-foreground [&_svg]:mx-0"
            aria-label={triggerLabel(provider, limits)}
          >
            <ProviderMark provider={provider} className="size-3.5" />
            <span
              className={highestUsedPercent !== null && highestUsedPercent > 90 ? "text-error" : ""}
            >
              {highestUsedPercent === null ? "--" : `${highestUsedPercent}%`}
            </span>
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
          failed={result._tag === "Failure"}
          pending={result.waiting}
          now={now}
        />
      </PopoverPopup>
    </Popover>
  );
}
