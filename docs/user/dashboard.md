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

- **Needs you**: pending approvals, questions waiting for an answer, and plans ready for review.
  Sorted by longest wait first, and a thread is highlighted once it has been waiting more than 10
  minutes.
- **Running**: threads where the agent is working or connecting. Shows the current plan step when
  one is known.
- **Monitoring**: watch loops, such as babysitting a pull request.
- **Done**: turns that finished in the last 24 hours, including ones that failed or were
  interrupted.

Archived threads never show up on the dashboard. Snoozed threads only appear if they need an
answer or approval.

## Summary strip and grouping

A summary strip at the top shows a count for each lane. Click a count to filter the dashboard down
to just that lane.

Group threads by **State** (the four lanes above) or by **Project**. If more than one environment
is connected, an environment filter also appears.

## Card actions

Each card offers actions for what it needs:

- **Approve** and **Deny** act on a pending approval directly from the card.
- **Answer** and **Review plan** open the thread so you can respond.
- **Stop** interrupts a running turn.
- **Open** goes to the thread.

Clicking anywhere else on the card also opens the thread.

Times on the dashboard refresh every 30 seconds; waiting times are approximate.

## Mobile

The dashboard is not available on mobile yet.
