# Dashboard

The Dashboard shows every thread across every project in one place, so you can see what needs
you, what's running, and what just finished without opening each project one by one.

## Opening the dashboard

- Click the Dashboard icon in the sidebar footer.
- Use the command palette entry "Open dashboard".
- Press `Cmd+Shift+H` (`Ctrl+Shift+H` on Windows and Linux). Pressing it again while you're already
  on the dashboard takes you back to where you were.

The Global dashboard opens across all profiles. Profile and Space overviews use the same board
scoped to their selection. The visible filters let you narrow that scope.

## Lanes

Threads are sorted into five lanes:

- **Needs you**: pending approvals, questions waiting for an answer, plans ready for review, and failed or interrupted turns.
  Sorted by longest wait first, and a thread is highlighted once it has been waiting more than 10
  minutes.
- **Running**: threads where the agent is working or connecting. Shows the current plan step when
  one is known.
- **Monitoring**: watch loops, such as babysitting a pull request.
- **Ready to review**: successful turns that have not been marked reviewed, regardless of age. A finished turn does not necessarily mean the whole task is finished.

- **Idle**: open chats that are not currently working or waiting for review. Checked results have a **Reviewed** badge.

The default **Active** view hides archived, snoozed, and explicitly settled tasks. Snoozed tasks with pending questions or approvals can still request attention. Use **Task visibility**
to inspect Snoozed, Settled, or Archived work in compact lists, separate from the active board.
These lists include older results and chats without a completed turn. Snoozed tasks show their
return time, soonest first, with **Unsnooze**. Settled tasks offer **Unsettle** and archived tasks
have **Restore**, both sorted most recent first. The last turn status is secondary information,
not a lane. Restoring an archive preserves any settlement or snooze still on that chat.
Unsent drafts remain in their composer. The **Settled** section below the active lanes shows its count and expands into a compact list. Opening a settled chat does not unsettle it. The section starts expanded when there are only settled chats, and remembers your choice.

## Board and filters

In Active, states appear in columns from left to right. Each heading counts the cards visible below it.
On narrow windows, scroll the lanes horizontally; cards keep a readable minimum width.

Choose a profile in the toolbar to filter the board and project choices. This stays in sync with
the sidebar's active profile. Choose **All** to see every profile. Search task titles, projects, paths, or branches, and filter
by device, provider, or folder using the visible controls. **Scope** contains Profile and Space. **Location** contains Device, Folder, Branch, and Pull request. **View** contains Provider, Status, and Group by. Use **Reset filters** to clear the task filters. Device choices follow the active profile. Choosing a device narrows
provider and project choices; choosing a provider further narrows projects. Changing an upstream
filter clears downstream selections. All options restore the wider scope.

Project options show the directory, device, and providers used by threads. A project
can show multiple providers. Provider filtering groups instances of the same provider, such as Claude
or Codex, across the selected devices. Group by **Project** to put each project's tasks in its own column.

**Mark reviewed** moves a completed result to Idle. **Keep for review** moves it back to Ready to review.
Opening a chat only clears its unread indicator. A new completion becomes unreviewed again, and
resuming a chat moves it to Running. Reviewing never removes an open column from your board.
Review choices are remembered on the current browser or desktop client.

Opening a dashboard card starts a review queue from the visible attention requests and results.
**Next item** skips items that no longer need review; **Back to dashboard** restores the original
profile, filters, grouping, and scroll position. No action is taken on a request just by opening it.

Use **Saved views** to name the current profile, Space, filters and grouping.
Select a saved name to restore it, or save with the same name to replace it. Delete has Undo.
Views are stored on this client. If a saved profile, Space, device, provider, or project no longer
exists in that scope, applying the view explains the missing selection and leaves your current view intact.

Cards identify their device and provider. Disconnected devices remain selectable, and their cards
show that the status is last known. Actions resume when the device reconnects.

All filters also apply to the Snoozed, Settled, and Archived lists. Grouping only applies to the active board.

## Card actions

Each card offers actions for what it needs:

- **Approve** and **Deny** act on a pending approval directly from the card.
- **Answer** and **Review plan** open the thread so you can respond.
- **Stop** interrupts a running turn.
- **Mark reviewed** moves a completed result to Idle.

Click the card, or focus it and press Enter, to open the thread. Hover over its path to see the full directory.

Times on the dashboard refresh every 30 seconds; waiting times are approximate.

## Mobile

The dashboard is not available on mobile yet.

## Git and pull requests

Use the visible **Git** controls to search branch names or show tasks with or without a linked PR. These filters use
thread branch and explicit PR links; no link does not prove the branch has no PR on GitHub.

A linked PR badge opens its detail in the existing Pull Requests page. Status is shown when
available; disconnected or unavailable status is labeled rather than guessed.
**Pull requests** carries the selected project and device to that page. Both pages follow
the active profile. Agent-provider and branch filters stay dashboard-specific.

Dashboard filters are remembered when navigating away and returning. An unread dot marks a task
updated since your last visit. Finishing a turn means a result is available; explicitly settling a
task puts it away. PR merge state does not settle a task automatically.

All dashboard controls stay visible above the board. Group by remains visible but disabled when viewing Snoozed, Settled, or Archived tasks. Controls wrap into labeled groups on narrower windows.
