import {
  type EnvironmentId,
  type ProviderConsumeResetCreditOutcome,
  ProviderConsumeResetCreditInput,
  ServerProviderResetCredits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { AlertTriangleIcon, TrendingUpIcon } from "lucide-react";
import {
  elapsedShare,
  formatDuration,
  formatResetsIn,
  paceOf,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { Fragment, useRef, useState } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { UsageLimitAccounts } from "./UsageLimitAccounts";

/** Share of the quota used, 0..100. Everything on the usage screens reads as used. */
export function usedPercentOf(window: ServerProviderUsageWindow): number {
  return 100 - remainingPercent(window);
}

const NEAR_LIMIT_PERCENT = 90;

/** "Resets in 3h" as a standalone line. */
function resetsInLabel(window: ServerProviderUsageWindow, now: number): string {
  const resetsIn = formatResetsIn(window, now);
  return resetsIn ? resetsIn.charAt(0).toUpperCase() + resetsIn.slice(1) : "No reset time reported";
}

/**
 * Quota used, filling left to right in one neutral tone for every provider. The
 * hover card adds the exact reset time and how much of the window has passed.
 */
function WindowBar({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const used = usedPercentOf(window);
  const elapsed = elapsedShare(window, now);
  const resetsIn = formatResetsIn(window, now);
  const resetsAt = window.resetsAt
    ? formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)
    : null;
  const summary = `${window.label}: ${used}% used${resetsIn ? `, ${resetsIn}` : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="img"
            aria-label={summary}
            tabIndex={0}
            className="relative h-2 cursor-default overflow-hidden rounded-full border border-foreground/10 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        }
      >
        {used > 0 ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
            style={{ width: `${Math.max(used, 1.5)}%` }}
          />
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-72 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">{used}% used</span>
          {elapsed !== null ? (
            <span className="text-muted-foreground">
              {Math.round(elapsed * 100)}% of the window has passed
            </span>
          ) : null}
          {resetsAt ? (
            <span className="text-muted-foreground">
              Resets {resetsAt}
              {resetsIn ? ` · ${resetsIn}` : ""}
            </span>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Speaks only when it matters: near the limit, or spending faster than the
 * window refills. Text and an icon, never color alone.
 */
function WindowStatus({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const used = usedPercentOf(window);
  if (used >= NEAR_LIMIT_PERCENT) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <AlertTriangleIcon aria-hidden className="size-3.5" />
        Near limit
      </span>
    );
  }
  if (paceOf(window, now) !== "ahead") return null;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      <TrendingUpIcon aria-hidden className="size-3.5" />
      Ahead of pace
    </span>
  );
}

/**
 * One account's windows. Cards lay them side by side (label, percent used, bar,
 * reset); compact rows fit the composer panel.
 */
export function LimitWindows({
  windows,
  now,
  compact = false,
  cards = false,
}: {
  readonly cards?: boolean;
  readonly windows: ReadonlyArray<ServerProviderUsageWindow>;
  readonly now: number;
  readonly compact?: boolean;
}) {
  if (cards)
    return (
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {windows.map((window) => (
          <div key={window.id} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] font-medium text-foreground/80">
                {window.label}
              </span>
              <span className="shrink-0 tabular-nums">
                <strong className="text-lg font-semibold text-foreground">
                  {usedPercentOf(window)}%
                </strong>{" "}
                <span className="text-xs text-muted-foreground">used</span>
              </span>
            </div>
            <WindowBar window={window} now={now} />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
              <WindowStatus window={window} now={now} />
              <span className="ms-auto">{resetsInLabel(window, now)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div
      className={
        compact
          ? "grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] gap-x-3 gap-y-0.5"
          : "grid grid-cols-[11rem_minmax(0,1fr)_7rem] gap-x-4 gap-y-1"
      }
    >
      {windows.map((window) => {
        const resetsIn = formatResetsIn(window, now);
        return (
          <Fragment key={window.id}>
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate text-muted-foreground">{window.label}</span>
              <span className="ms-auto shrink-0 font-medium text-foreground tabular-nums">
                {usedPercentOf(window)}% used
              </span>
            </span>
            <WindowBar window={window} now={now} />
            <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              <span className="ms-auto shrink-0">{resetsIn ?? ""}</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

const OUTCOME_TEXT: Record<ProviderConsumeResetCreditOutcome, string> = {
  reset: "Reset applied. Your windows have cleared.",
  nothingToReset: "Nothing to reset right now.",
  noCredit: "No reset credit left.",
  alreadyRedeemed: "That credit was already redeemed.",
};

/** Everything a redeem needs: where to send it and what to say afterwards. */
export function useResetCredit(
  environmentId: EnvironmentId,
  input: ProviderConsumeResetCreditInput,
) {
  const consume = useAtomCommand(serverEnvironment.consumeResetCredit, { reportFailure: false });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inFlight = useRef(false);

  const redeem = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setConfirming(false);
    setBusy(true);
    setStatus(null);
    const result = await consume({ environmentId, input }).finally(() => {
      inFlight.current = false;
      setBusy(false);
    });
    if (result._tag === "Success") {
      setStatus(
        [OUTCOME_TEXT[result.value.outcome], result.value.warning].filter(Boolean).join(" "),
      );
      return;
    }
    setStatus(
      "error" in result.cause && result.cause.error instanceof Error
        ? result.cause.error.message
        : "Could not use the reset credit.",
    );
  };

  return { confirming, setConfirming, busy, status, redeem };
}

/**
 * The confirm for a redeem. Redeeming spends a credit the provider granted the
 * user, so it never fires on a bare click. Mount it outside any popover that
 * holds the button: dialogs stack under popovers, and closing the popover
 * would unmount a dialog rendered inside it.
 */
export function ResetCreditDialog({
  open,
  onOpenChange,
  onConfirm,
  accountLabel,
}: {
  readonly accountLabel?: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Use a reset credit?</AlertDialogTitle>
          {accountLabel && <p className="text-sm font-medium break-words">{accountLabel}</p>}
          <AlertDialogDescription>
            This asks the provider to redeem one banked credit for this account. If applied, it
            resets your rate-limit windows and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button onClick={onConfirm}>Use credit</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** `2 reset credits banked · next expires in 27d 23h`, or the short form for a popover. */
export function resetCreditsSummary(
  credits: ServerProviderResetCredits,
  now: number,
  compact = false,
): string {
  const expiresIn = credits.nextExpiresAt
    ? formatDuration(Date.parse(credits.nextExpiresAt) - now)
    : null;
  if (credits.availableCount === 0) return "No reset credits banked";
  if (compact)
    return `${credits.availableCount} banked${expiresIn ? ` · expires in ${expiresIn}` : ""}`;
  return `${credits.availableCount} ${credits.availableCount === 1 ? "reset credit" : "reset credits"} banked${
    expiresIn ? ` · next expires in ${expiresIn}` : ""
  }`;
}

/** Banked reset credits with the redeem button and its confirm, self-contained. */
export function ResetCredits({
  environmentId,
  input,
  credits,
  now,
  accountLabel,
  disabled = false,
}: {
  readonly accountLabel?: string | undefined;
  readonly disabled?: boolean;
  readonly environmentId: EnvironmentId;
  readonly input: ProviderConsumeResetCreditInput;
  readonly credits: ServerProviderResetCredits;
  readonly now: number;
}) {
  const { confirming, setConfirming, busy, status, redeem } = useResetCredit(environmentId, input);
  if (credits.availableCount === 0 && status === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="tabular-nums">{resetCreditsSummary(credits, now)}</span>
      {credits.availableCount > 0 ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => setConfirming(true)}
        >
          {busy ? "Using…" : "Use reset"}
        </Button>
      ) : null}
      {status ? (
        <span role="status" className="basis-full text-foreground">
          {status}
        </span>
      ) : null}
      <ResetCreditDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          if (!disabled) void redeem();
        }}
        accountLabel={accountLabel}
      />
    </div>
  );
}

/**
 * Subscription quota across every connected environment's providers and hubs,
 * pooled per provider. The page updates countdowns only while visible.
 */
export function UsageLimitsSection({
  selectedEnvironmentIds,
  now,
}: {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly now: number;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const selected =
    selectedEnvironmentIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedEnvironmentIds.has(id)));
  return <UsageLimitAccounts presentations={selected} now={now} />;
}
