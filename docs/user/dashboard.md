# Dashboard

The Dashboard shows every thread across every project in one place, so you can see what needs
you, what's running, and what just finished without opening each project one by one.

## Opening the dashboard

- Click the Dashboard icon in the sidebar footer.
- Use the command palette entry "Open dashboard".
- Press `Cmd+Shift+H` (`Ctrl+Shift+H` on Windows and Linux). Pressing it again while you're already
  on the dashboard takes you back to where you were.

The dashboard only shows threads in your active [profile](./profiles.md); switch profiles to see a
different set.

## Lanes

Threads are sorted into four lanes:

- **Needs you**: pending approvals, questions waiting for an answer, plans ready for review, and recent failed or interrupted turns.
  Sorted by longest wait first, and a thread is highlighted once it has been waiting more than 10
  minutes.
- **Running**: threads where the agent is working or connecting. Shows the current plan step when
  one is known.
- **Monitoring**: watch loops, such as babysitting a pull request.
- **Ready to review**: successful turns that finished in the last 24 hours and have not been opened since completing. A finished turn does not necessarily mean the whole task is finished.

The default **Active** view hides archived, snoozed, and explicitly settled tasks. Snoozed or
settled tasks with pending questions or approvals can still request attention. Use **Task visibility**
to inspect Snoozed, Settled, or Archived work in compact lists, separate from the active board.
These lists include older results and chats without a completed turn. Snoozed tasks show their
return time, soonest first, with **Unsnooze**. Settled tasks offer **Reopen** and archived tasks
have **Restore**, both sorted most recent first. The last turn status is secondary information,
not a lane. Restoring an archive preserves any settlement or snooze still on that chat.
Drafts and idle tasks without a result do not appear on the active board.

## Board and filters

In Active, states appear in columns from left to right. Each heading counts the cards visible below it.
Columns scroll independently; on narrow windows, scroll horizontally to see the rest of the board.

Choose a profile in the toolbar to filter the board and project choices. This stays in sync with
the sidebar's active profile. Choose **All** to see every profile. Search task titles, projects, paths, or branches, and filter
by device, provider, or project. Device choices follow the active profile. Choosing a device narrows
provider and project choices; choosing a provider further narrows projects. Changing an upstream
filter clears downstream selections. All options restore the wider scope.

Project options show the directory, device, and providers used by threads. A project
can show multiple providers. Provider filtering groups instances of the same provider, such as Claude
or Codex, across the selected devices. Group by **Project** to put each project's tasks in its own column.

In the Active view, **Unreviewed** hides successful results you have already opened. **Recent 24h** brings those results
back. Requests for attention and active work remain visible in either view.

Cards identify their device and provider. Disconnected devices remain selectable, and their cards
show that the status is last known. Actions resume when the device reconnects.

All filters also apply to the Snoozed, Settled, and Archived lists. Grouping and result-window
controls only apply to the active board.

## Card actions

Each card offers actions for what it needs:

- **Approve** and **Deny** act on a pending approval directly from the card.
- **Answer** and **Review plan** open the thread so you can respond.
- **Stop** interrupts a running turn.

Click the card, or focus it and press Enter, to open the thread. Hover over its project name to see the directory.

Times on the dashboard refresh every 30 seconds; waiting times are approximate.

## Mobile

The dashboard is not available on mobile yet.

## Git and pull requests

Open **Git** to search branch names or show tasks with or without a linked PR. These filters use
thread branch and explicit PR links; no link does not prove the branch has no PR on GitHub.

A linked PR badge opens its detail in the existing Pull Requests page. Status is shown when
available; disconnected or unavailable status is labeled rather than guessed.
**Pull requests** carries the selected project and device to that page. Both pages follow
the active profile. Agent-provider and branch filters stay dashboard-specific.

Dashboard filters are remembered when navigating away and returning. An unread dot marks a task
updated since your last visit. Finishing a turn means a result is available; explicitly settling a
task puts it away. PR merge state does not settle a task automatically.

Dashboard controls are grouped by purpose: Profile, Space, and Project define the
scope; Device, Provider, and Git refine it. Visibility, grouping, and review controls
sit directly above the board. Search and Pull requests are in the page header.
