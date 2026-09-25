import {
  collectLimitAccounts,
  collectLimitNotices,
  formatDuration,
  type LimitAccount,
} from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon, MonitorIcon, WifiOffIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getDriverOption } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Alert, AlertTitle } from "../ui/alert";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { LimitWindows, ResetCredits } from "./UsageLimits";

type Presentations = Parameters<typeof collectLimitAccounts>[0];

/** A report older than this is flagged, since a turn or refresh would normally have replaced it. */
const STALE_AFTER_MS = 10 * 60_000;

/** `someone@example.com` → `SE`: enough to tell accounts apart, too little to identify one. */
function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

/**
 * The model picker's mark for a native instance; hub accounts have no instance,
 * so they get neutral initials instead.
 */
function AccountMark({ account }: { readonly account: LimitAccount }) {
  if (account.redeem) {
    return (
      <ProviderInstanceIcon
        driverKind={account.driver}
        displayName={providerName(account)}
        accentColor={account.accentColor}
        showBadge={Boolean(account.displayName)}
        indicatorBackground="var(--popover)"
        className="size-5"
        iconClassName="size-4 text-foreground/80"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[9px] font-semibold text-foreground/80"
    >
      {account.email ? accountInitials(account.email) : "?"}
    </span>
  );
}

function providerName(account: LimitAccount): string {
  return account.displayName ?? getDriverOption(account.driver)?.label ?? String(account.driver);
}

function ReportedAt({
  checkedAt,
  now,
  offline,
}: {
  readonly checkedAt: string;
  readonly now: number;
  readonly offline: boolean;
}) {
  const at = new Date(checkedAt);
  const age = Math.max(0, now - at.getTime());
  const stale = offline || age > STALE_AFTER_MS;
  const ago = Number.isFinite(age)
    ? age < 60_000
      ? "just now"
      : `${formatDuration(age)} ago`
    : "at an unknown time";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            tabIndex={0}
            dateTime={checkedAt}
            className={cn(
              "inline-flex items-center gap-1 rounded tabular-nums focus-visible:ring-2 focus-visible:ring-ring",
              stale && "font-medium text-foreground",
            )}
          />
        }
      >
        {offline ? <WifiOffIcon aria-hidden className="size-3" /> : null}
        {offline ? `Device offline · ${ago}` : `Updated ${ago}`}
      </TooltipTrigger>
      <TooltipPopup>{at.toLocaleString()}</TooltipPopup>
    </Tooltip>
  );
}

function AccountCard({
  account,
  presentations,
  now,
}: {
  readonly account: LimitAccount;
  readonly presentations: Presentations;
  readonly now: number;
}) {
  const connectionPhase = (environmentId: string) =>
    presentations.get(environmentId as never)?.connection?.phase;
  const offline =
    account.environments.length > 0 &&
    account.environments.every((entry) => {
      const phase = connectionPhase(entry.environmentId);
      return phase !== undefined && phase !== "connected";
    });
  const devices =
    account.environments.map((entry) => entry.label).join(", ") || account.sourceLabel;
  const readFailed = account.limits.unavailable?.reason === "probeFailed";
  const credits = account.redeem ? account.limits.resetCredits : undefined;
  const redeemPhase = account.redeem ? connectionPhase(account.redeem.environmentId) : undefined;
  return (
    <section className="surface-raised-sm min-w-0 overflow-hidden rounded-xl">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/70 px-5 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AccountMark account={account} />
          <h2 className="shrink-0 text-sm font-semibold text-foreground">
            {providerName(account)}
          </h2>
          {account.plan ? (
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              {account.plan}
            </span>
          ) : null}
          {account.email ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              <RedactedSensitiveText
                value={account.email}
                ariaLabel="Toggle account email visibility"
                revealTooltip="Reveal email"
                hideTooltip="Hide email"
              />
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger
              render={<span tabIndex={0} className="inline-flex min-w-0 items-center gap-1.5" />}
            >
              <MonitorIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="max-w-56 truncate">{devices}</span>
            </TooltipTrigger>
            <TooltipPopup>Signed in on {devices}</TooltipPopup>
          </Tooltip>
          <span aria-hidden className="h-3 w-px bg-border" />
          <ReportedAt checkedAt={account.limits.checkedAt} now={now} offline={offline} />
        </div>
      </header>
      <div className="px-5 py-4">
        <LimitWindows windows={account.limits.windows} now={now} cards />
      </div>
      {readFailed || (credits && account.redeem) ? (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 px-5 py-2.5">
          {readFailed ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AlertTriangleIcon aria-hidden className="size-3.5 shrink-0" />
              Couldn't refresh. Showing the last reading.
            </p>
          ) : null}
          {credits && account.redeem ? (
            <div className="ms-auto">
              <ResetCredits
                environmentId={account.redeem.environmentId}
                input={account.redeem.input}
                credits={credits}
                accountLabel={`${providerName(account)}${account.email ? ` · ${account.email}` : ""}`}
                disabled={redeemPhase !== undefined && redeemPhase !== "connected"}
                now={now}
              />
            </div>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

/**
 * Every subscription account the selected devices report, one full-width card
 * each, grouped by provider so the same provider's accounts sit together.
 */
export function UsageLimitAccounts({
  presentations,
  now: openedAt,
}: {
  readonly presentations: Presentations;
  readonly now: number;
}) {
  const accounts = collectLimitAccounts(presentations).toSorted((left, right) =>
    providerName(left).localeCompare(providerName(right)),
  );
  // New reports advance the countdown anchor without a repainting timer.
  const now = Math.max(
    openedAt,
    ...accounts.map((account) => Date.parse(account.limits.checkedAt)).filter(Number.isFinite),
  );
  const notices = collectLimitNotices(presentations);
  return (
    <div className="flex flex-col gap-4">
      {accounts.length === 0 && notices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No provider on the selected devices reports subscription limits.
        </div>
      ) : null}
      {accounts.map((account) => (
        <AccountCard key={account.key} account={account} presentations={presentations} now={now} />
      ))}
      {notices.length > 0 ? (
        <Alert variant="warning" controlAlignment="first-line">
          <AlertTriangleIcon />
          {notices.map((notice) => (
            <AlertTitle key={notice} className="break-words">
              {notice}
            </AlertTitle>
          ))}
        </Alert>
      ) : null}
    </div>
  );
}
