# Stable upstream maintenance

The T3 stable release review heartbeat checks daily at 09:00 America/Toronto.
It reviews published stable releases from `pingdotgg/t3code`, never nightly
releases or the current upstream main branch. A release becomes eligible 24
hours after publication. A newer stable release supersedes the pending review.

## Authority and baseline

The background task may fetch refs, inspect code and release notes, and run
focused checks or reversible merge trials in isolated temporary worktrees.
It must not alter the user's checkout, stash changes, commit work, push,
create a PR, integrate an update, build a release, or replace the installed app.
Those actions require approval after discussing the review.

Determine the baseline from Git ancestry and previously accepted integration
records. The packaged version alone is not proof of the source baseline.
This fork may already contain commits newer than the latest stable tag.
Account for those commits rather than downgrading or treating them as custom
features. Also inspect uncommitted changes, which are part of the intended
product but may not be included in a worktree merge trial. State that limitation.

## Custom behavior to preserve

- Profiles scope projects and threads across environments; switching supports
  sidebar controls, trackpad gestures, keybindings, and the command palette.
- Spaces organize threads within profiles, support profile-level and space-level
  pins, and promote threads to the profile root on deletion. The sidebar uses
  a compact grid and a neutral matte selection palette.
- Dashboard scope includes profile, space, project, device, provider, and Git
  filters with dependent options. Active work uses horizontal columns;
  snoozed, settled, and archived work has separate history views.
- Latest-message editing retains attachments and offers conversation rewind
  with optional code restoration. Inspect actual Codex and Claude capabilities
  and limitations before comparing them with upstream implementations.
- Web and desktop are the custom UI targets; shared server contracts and remote
  environment behavior must remain compatible. Mobile work is outside this scope.

This is a review checklist, not evidence that every feature works. Inspect the
current implementation and focused tests on each relevant review.

## Review output

Report the stable tag and publication date, verified baseline, useful features
and fixes, overlaps with our changes, adoption recommendations, implementation
effort with reasons, migrations, conflict risks, and checks performed. Distinguish
features present upstream from features proposed for integration. Prefer upstream
implementations when they meet our requirements; retain only valuable differences.

Retain concise notes outside the repository with exact tag and commit identifiers.
Use these notes and the heartbeat thread history to avoid reporting the same tag
again. Keep credentials and raw transcripts out of notes. Stay quiet unless a new
review is ready or an actionable blocker requires input. After reporting, wait
for discussion and approval. Approval of one tag does not authorize future merges.
