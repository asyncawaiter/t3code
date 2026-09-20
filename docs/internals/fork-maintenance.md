# Nightly fork maintenance

The release review heartbeat runs every three days at 09:00 America/Toronto. Review the
newest published non-draft nightly from `pingdotgg/t3code`, including nightly
prereleases, without a waiting period. Also flag significant stable releases
or stable releases that supersede a reviewed baseline. Ignore unrelated
prereleases, drafts, and unreleased main.

Pin the exact tag and resolved commit SHA. A newer candidate can supersede an
unapproved proposal; it must never silently replace an approved candidate.
Deduplicate by tag, SHA, Git ancestry, and prior review records.

## Authority and baseline

Locate the latest accepted fork source and inventory every checkout carrying custom
work, including `/Users/abhishek/Documents/t3code`. Include tracked and untracked
changes. A new worktree does not inherit those edits. Confirm source authority from
accepted integration records and content, not the working directory or branch label.
Scheduled runs authorize investigation only: fetch selected release refs,
inspect source and release notes, and run focused checks or reversible merge
trials in isolation. Do not alter or stash the user's checkout, write live app
data, start servers or providers, submit prompts, or open browsers during a
scheduled review.

Discuss and carry out specifically approved follow-through in the dedicated
release-review task. Integration, commits, pushes, PR creation, packaging, and
installation require authorization for their respective scope. Once a step is
authorized, complete it without asking again. Approval of one update does not
authorize future updates. Updating this procedure does not authorize integration.

Determine the baseline from Git ancestry and accepted integration records.
Inspect packaged contents when comparing with the installed app: its version or
embedded commit may omit bundled uncommitted work. Account for already-integrated
upstream commits. Inventory uncommitted changes and state explicitly whether a
trial includes them.

## Preservation and integration choices

Retain all custom user capabilities by default while incorporating applicable
nightly additions across desktop, web, and iOS. Preserve both independent
features. For overlapping implementations, compare behavior and coverage before
recommending keep, adopt, or combine. Deliberate with the user before replacing
custom behavior, even if upstream appears to subsume it. Internal conflict
resolution that preserves the agreed behavior is routine implementation work.

Where behaviors cannot operate together, investigate retaining both through an
explicit user choice or separate workflow. Explain any platform limitation or
unavoidable tradeoff instead of silently dropping one. Add configuration only
for an actual conflict. Report upstream feature removals as well as additions.

Enable applicable adopted features by default. Keep controls when they resolve a
concrete conflict or a user preference. Preserve explicit saved choices and respect
operating-system permissions. Official upstream updates remain disabled so they
cannot replace the custom build.

Fork installers require the public T3 Connect settings from `.env.example` in
the build worktree's `.env`. The packaging preflight rejects missing settings;
verify Connect controls in the packaged app before delivery.

## Custom behavior to preserve

- Profiles and Spaces are shared visual organization, not access controls.
  Connected devices share organization while keeping local selections independent.
  Switching supports sidebar controls, deliberate smooth trackpad swipes,
  keybindings, and the command palette.
- Preserve equal Space tiles, the Unsorted tile within profiles for unassigned chats, compact theme-aligned UI, and all
  views, nearby device/path previews, arbitrary-folder browsing, Space launch
  defaults, reliable standard new-chat entry points, and same-profile assignment.
- One pin menu offers global, owning-profile, and assigned-space scopes. Space
  deletion returns threads and pins to their profile. Preserve unique numbered
  fork titles, Show current chat/Show in list, and account/T3 Connect controls.
- Settlement is manual, including when old settings enabled inactivity or PR
  auto-settlement. Space tile counts exclude settled chats.
- Dashboard scope includes profile, space, project, device, provider, and Git
  filters with dependent options. Active work uses horizontal columns;
  snoozed, settled, and archived work has separate history views.
- Use the adopted upstream rewind flow, retaining attachments when restoring a
  message to the composer. Do not restore the retired custom edit payload flow.
  Older clients sending that payload must receive an explicit upgrade error
  before history or files change. Inspect provider rewind capabilities and limits.
- Provider-only user-turn metadata preserves submission, delivery, previous-user
  time and elapsed gap, plus original dates in newly created fork context.
- Preserve the composer account-usage indicator and its detailed quota/reset popup,
  including compact composer mode. Show each quota window directly, including Claude overall
  and Fable, and keep the granular Accounts view as the Usage default. The context meter, Usage page and `/usage-limits`
  report are separate entry points and do not replace it.
- Preserve in-progress iOS organization, dashboard, draft, edit/rewind, fork and
  per-device PR flows. Shared contracts and remote behavior must remain compatible
  across clients. Distinguish implemented code, native validation, and delivery.

This list describes intended behavior, not proof of working or shipped features.
Inspect relevant source and focused tests. Track unresolved bugs separately,
including Poly's inactive Space controls; a profile-readiness hypothesis is not
a confirmed diagnosis. Preserve unfinished mobile work and existing signing
constraints. Do not remove capabilities or choose a signing team without approval.

## Review output

Begin every actionable report with what is new, split into desktop/web and iOS.
For each feature or coherent feature group, describe the benefit, platform
availability, overlap with our fork, keep/adopt/combine recommendation, integration
involvement and reason, and any decision needed. Include meaningful fixes and
removals. Distinguish newly available capabilities from upstream equivalents of
features already in our fork. Desktop-only features are not automatically iOS
features. Group routine fixes, tests, CI, and marketing changes without obscuring
user-visible additions.

Then provide the exact tag/SHA and publication time, fork and shared baseline,
conflict and migration findings, provider and multi-device compatibility, checks
performed, and limitations. State separately for desktop and iOS whether source
integration can proceed, what blocks delivery, and which choices require the user.
Explain effort estimates and separate shared work from platform-specific work.
Do not present code inspection or clean merges as runtime verification.

## Custom release delivery

Integrating nightly source produces our own fork build. Preserve the intended
app identity, data locations, and custom distribution. Prevent official desktop
updates and upstream mobile OTA updates from replacing our custom features.
Review label/version behavior and updater configuration before the first transition.

Preserve applied migration identities and validate upgrades from both existing
fork data and fresh schemas in isolation. Retain fork migration IDs 048
(fork origin) and 049 (fork context).
The September 8 nightly's branch PR and active ordering migrations are 050 and 051
in this fork. Subsequent multi-PR, message-context, title-state, and PR-file-view
migrations use 052 through 055. Validate existing fork rows and migration identities
when upgrading; never reuse an applied ID for another migration.
Before an authorized migration-bearing
installation, back up data and establish rollback; an old DMG alone is insufficient.
Package accurate source metadata and verify bundled custom features. Coordinate
Godel/Poly deployment and mobile server compatibility. Use Sqim for authorized
iOS delivery and distinguish signing/provisioning blockers from source integration.

Keep review findings and decisions outside the repository, with exact tag and
commit identifiers, without credentials or raw transcripts. Stay quiet unless a
new actionable review is ready or input is required. Recheck the candidate and
working state before approved integration; discuss any material change.
