# Usage and limits

## Understand your usage

**Usage** combines Codex, Claude Code, and Grok Build session history from your connected
environments. It shows subscription limits and token activity by provider, model, and date.
Token totals measure activity, not subscription allowance or your bill.

Totals depend on the history available on each server. Grok turns without a saved completed-turn
record are missing from the totals.

Usage includes each configured account's history, including disabled accounts. Custom homes follow
the account's home setting or its `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, or `GROK_HOME` environment
variable. Use absolute paths or `~/` paths in the account's environment settings; relative
environment paths depend on each project's working directory and cannot be reliably discovered
by Usage. Accounts sharing a history directory count once.

On web and desktop, use the environment dropdown to filter tokens and limits. All
environments are selected by default. The dropdown shows which environments are still scanning;
results appear as each one responds.

If recent work is missing, refresh to rescan session history.

## Track subscription limits

**Usage → Limits** opens in **Accounts**, showing each account's quota windows, percent used,
reset countdowns and available reset credits. Claude's overall and model-specific weekly
windows appear separately, including Fable when reported. Provider marks identify each account;
the heading includes its plan and connected devices.

Each account shows when its provider last reported usage. Refresh requests a new report;
it does not make an old report current. Disconnected devices and older reports are marked.
The date range applies to Tokens, not subscription limits.

Reset credits require confirmation. A reset outcome and a failure to refresh the displayed
balance are reported separately. If a reset request loses its response, retrying on the same
device reuses the pending attempt, including after restarting the app.

Choose **Combined** for the pooled summary across accounts. Each window card shows how much of the pool is left and a bar with one segment per account,
kept in the same column across windows. Accounts are ordered by their 5-hour reset, soonest
first, or by the first available window when no account reports a 5-hour limit. A gap means the
account does not report that window. When the provider reports reset times, the card also says
when the next reset lands and how much it hands back. The hatched
part of a segment is what that reset restores. Tap a segment or account row for the account's plan,
where it is signed in, and its reset time. On web, you can hover too. Codex accounts with banked
reset credits show a ticket count and the **Use reset** action in the account details. On narrow screens, numbered rows below
the bar show each account's quota, countdown, and credits. Tap a row to open its details.

The same account signed in on more than one environment, or reported by a hub as well, counts once.
Filter with the environment dropdown to see what a single machine has.

The composer also shows compact quota bars and percentages for the selected account. Claude's
overall and Fable windows remain visible without hovering when the account reports them. On web
and desktop, open the indicator for reset countdowns and banked credits.

On web and desktop, the composer uses the same account snapshot as Usage. Provider events
update it immediately. While the app is visible, it also checks the selected account every
15 seconds, after a turn ends, when you return to the app, and when you open the
indicator. Briefly repeated requests are combined. Hidden windows stop polling; failed reads
keep the last good numbers and retry after a minute. Updates still depend on when the provider
reports its latest usage.

Opening Limits checks the selected connected environments automatically. Each client waits at
least five minutes between automatic checks of an environment, including after a failed check.
If a window still looks stale, refresh Limits to re-check every provider and hub.

Pick `/usage-limits` from the composer's command menu, or send it as a message, to check the
current model's limits without leaving the conversation. The result opens above the composer and
closes when you dismiss it or send your next message. It uses the same snapshot as **Usage → Limits**, so it does not run the agent or refresh
anything. The command is offered only for providers that appear under **Usage → Limits**.

OpenCode Go reports its session, weekly, and monthly allowance when OpenCode runs locally in
the environment. T3 cannot report limits for external OpenCode servers because their credentials
belong to the remote server. Cursor reports
its monthly allowance, including separate Auto and API usage, using a file-based CLI login or
`CURSOR_AUTH_TOKEN`. Cursor's default macOS keychain login does not currently report limits.
On macOS, use `AGENT_CLI_CREDENTIAL_STORE=file` when signing in and in the provider's environment
to use a file-based login.

Grok reports the remaining subscription allowance and reset time for its current billing period
after signing in with `grok login`. Explicit `XAI_API_KEY` connections and custom authentication
or endpoint configurations do not report subscription limits.

API-key accounts may not report subscription limits. This also applies to Claude connections
using a proxy through `ANTHROPIC_AUTH_TOKEN`.

## Connect a CLIProxyAPI hub

To see pooled accounts, open **Settings → Providers → Usage providers → Add hub**. Choose the
environment that will connect to the hub and enter its URL and management key.

The accounts appear under **Usage → Limits**. Codex accounts show banked reset credits; select an
account and choose **Use reset** to redeem one. No hub plugin is required.

This connection supplies usage information; configure
the provider separately to send agent requests through the hub. Remove the hub from the same
settings section when you no longer need it.

## Subscription usage widget

Add **Subscription usage** from your iOS or Android widget gallery to see remaining Codex and
Claude quotas. Tap it to open **Usage → Limits**. On iOS, use **Edit Widget** to choose Session,
Weekly, or both for each provider. Reopen T3 to refresh expired readings.
