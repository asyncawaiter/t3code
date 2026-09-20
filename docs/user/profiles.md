# Profiles

A profile is a named, colored group of projects shown in the sidebar, similar to browser profiles.
Use profiles to separate work by client, team, or context so the sidebar only shows the projects
that matter right now.

Use **Show current chat** beside the new-chat button to return the sidebar to the open chat.
It selects that chat's profile and space, clears search and project filters, and scrolls to
the highlighted chat. Chats without a space select **Unsorted**; projects without a
profile select **All**.

**All** always exists and shows every project regardless of profile. It cannot be renamed, recolored,
or removed.

## Creating and assigning profiles

Open **Settings, General, Profiles** to add, rename, recolor, reorder, or remove profiles. Give
each profile a name and a color; a project starts unassigned to any profile, which means it only
shows under All.

To put a project in a profile, open the project's settings and choose a profile from the **Profile**
select. A project belongs to at most one profile at a time; choosing a different one moves it there.
Removing a profile does not delete its projects, they just become unassigned again and keep showing
under All.

You can also assign directly in the sidebar. Open the project picker and click the profile label
or **Assign** beside a project, or right-click a thread and choose **Move project to profile**.
Choose a profile directly in the assignment panel. When the same repository has other known checkouts,
enable **Include all known checkouts** to move them together, including copies on other connected machines. This
matches repository identity, not just the folder name. Future checkouts are assigned separately.
The command palette also offers **Move project to profile** for its contextual project.

Choose **Unassigned** in the sidebar, or **None (All only)** in settings and the command palette,
to remove an assignment. Moving a checkout moves all its threads out of
the previous profile; it does not move files or stop running work.

## Switching profiles

Use the profile pills under Search in the sidebar to switch profiles. The selected
profile widens to show its name; the others show initials. Hover or focus a pill to see its full name. With many profiles, scroll the strip horizontally. On a trackpad,
a two-finger horizontal swipe anywhere in the sidebar switches between profiles in order,
including over Search, the profile buttons, empty space, and the footer. You can reverse
direction or swipe again while the previous swipe's momentum is slowing down. Vertical
scrolling continues to scroll the thread list.

The macOS desktop app recognizes each swipe as a separate gesture, with no cooldown
between swipes. One gesture moves one profile, even if its momentum continues.
Browser clients and older desktop builds use wheel-based detection instead.

Keyboard shortcuts move to the next or previous profile:

- Next profile: `Cmd+Option+]` (`Ctrl+Alt+]` on Windows and Linux)
- Previous profile: `Cmd+Option+[` (`Ctrl+Alt+[` on Windows and Linux)

The command palette also lists a "Switch to profile" entry for each profile.

The project picker and thread search are scoped to the selected profile. Sidebar search matches
thread titles and indicates its current scope. The sidebar's new-thread button, keyboard shortcuts, and the
command palette choose projects within that profile, even if a thread from another profile is
still open. An empty profile offers **Add project**. New projects join the active profile;
opening an existing project from outside it asks whether to move that checkout into the profile.

Profiles organize your view. They do not restrict filesystem access or prevent opening a thread
through a direct link. On web and desktop, switching profiles from a chat or draft restores the
last chat and Space you used in that profile, along with its sidebar scroll position. If that
chat is no longer available, the current chat stays open. Switching profiles on the dashboard
changes its scope without opening a chat. This navigation history stays on the current client.

## Syncing

Profiles and spaces use one shared source device. Every connected desktop, web, and mobile client reads
the same collection, including names, ordering, project assignments, space membership, new-chat
defaults, and pin scopes. Pin status and pin order continue to stream from each chat's host.
The selected profile, search, scroll position, and open chat stay independent on each client.
Unsent drafts stay on the client where you compose them.

Open **Manage profiles** from the sidebar profile menu, or **Settings, General, Profiles**, to see
the shared source. An existing collection is discovered automatically when the connected devices
have one collection or identical copies. If devices have different collections, choose the device
whose collection you want to use. Other devices' previous collections are retained, not merged or
deleted. Changing the source selects that device's stored collection; it does not move the current
collection to that device.

Once a profile is available on your device, you can create and edit its Spaces even when the
shared source is offline or loading. Edits save on your device before appearing and survive an
app restart. **Pending sync** means they have not reached the shared source yet. The app retries
when that source reconnects with a build supporting shared profiles. Starting a chat still needs
its execution device; creating an empty Space does not.

Independent edits merge with the latest shared collection, including Spaces added on another
device. Competing changes stay saved locally and show **Organization needs attention**. Open
**Review** to retry or explicitly discard pending edits and use the shared version. Pending edits
stay attached to their original source; sync or discard them before choosing a different source.
On iPhone, tap the sync status for these actions. Local storage failures leave the Space editor open with an error.

Profile sharing does not copy files, transfer execution, grant permissions, or connect an unpaired
device automatically. The selected profile and Space remain independent on each device.

## Spaces

Spaces use a fixed three-column grid. The sidebar can expand, but its minimum desktop width
keeps all three columns usable. Tiles show the saved icons of their participating projects,
the Space name, a quieter chat count, and the configured numbered shortcut. Up to three
project icons appear on a tile, with an overflow count for additional projects. Hover or
keyboard-focus a Space to see all project names, paths, devices, chat and draft counts,
and the default project for new chats. Names can span two lines.
Selected profiles and Spaces follow the current theme's chat highlight.

Device headings and their chats share a subtle border within each section. Headings use the
configured device name, with the server name on hover. Settled stays separated from the
preceding chats by an inactive gap, so clicking just below a chat does not toggle the shelf.

Spaces organize threads within a profile. Click **New space** beside the Spaces heading,
enter a name, and press Enter. Each tile counts active chats, excluding settled and archived chats.
Reopening a settled chat adds it back to the count. **Unsorted** is always the
first tile in individual profiles and contains chats without a Space assignment.
Unsorted cannot be renamed or deleted. On web and desktop, **All** shows chats across
profiles without Space tiles or an All chats button. Its Recent / Device / Space controls
sit below the profile switcher. Space groups include the owning profile name; unassigned
chats appear in an Unsorted group. Space shortcuts apply only within individual profiles.
Select a named tile to show its chats and open its space overview. Clicking the selected
tile keeps that space open; use Unsorted to view unassigned chats. Switching to
a profile restores its last selected Space on web and desktop, or Unsorted on the first visit.
Creating a Space does not select it or hide unassigned chats.
Selecting a Space with only settled chats opens its Settled section automatically. You can
collapse it for the current visit; returning to the Space opens it again if it still has no
active or pinned chats. This also applies to Unsorted.
Use **All chats** beside the Spaces heading to include both assigned and unassigned chats.
The selected button uses the same theme highlight as the tiles. In the web and desktop
sidebar, All chats shows a **Recent / Device / Space** control below the space tiles.
Recent is the initial view: active chats appear newest first without group containers.
Device and Space collect chats into separate outlined groups. Device groups label each
chat with its space; Space groups label each chat with its device. Recent shows both.
Your grouping choice is remembered on this browser or desktop client and only applies
to All chats. Selecting a single space keeps its device containers.

Pinned, Snoozed, and Settled retain their separate sections. All chats uses automatic
ordering for active chats; drag a chat onto a space tile or a section to move it. Manual
active ordering remains available inside a single space. Grouping never moves a chat,
changes its space, or transfers it to a different device.
An empty selected view also offers **Show all threads**.
On web and desktop, the filter button beside Search lists projects in the selected view.
Choosing a project shows a **Project: name** chip above the chats. Clear the chip to restore
all projects. Choosing a Space or switching profiles clears that project filter.

Active chats are grouped by device within the selected profile or Space, even when
there is only one device. Each header shows the device name, chat count, and connection
status. Pinned, snoozed, and settled chats
keep their existing sections. Space tiles show names and counts; the plus-button preview
shows the saved device and folder for new chats.
Assigning a project to a profile does not assign its chats to a same-named space.
Profile pins appear in the **Pinned** section directly below the Space tiles. A dot on a tile indicates work that needs attention.

Use the tag button on a chat row or its **Move to space** context-menu action to choose
a space. These work in All as well as a specific profile. Choose **Unsorted** to
remove a space assignment. If the project has no profile, the dialog lets you choose one
first and explains that moving a project changes the profile of all its chats.
On web and desktop, drag a chat row or its tag icon to a named Space tile to assign it.
A floating card follows the pointer and identifies the chat or Space being moved.
If the dragged chat is selected, all selected chats move together. They must belong
to the target Space's profile. Drop on Unsorted or the selected profile strip to remove
the Space assignment. Within the chat list, drag rows to reorder them or move them
between Pinned, Active, and Settled.
Hover a chat or focus its pin button to open **Pin options** directly. The menu is also available
from the chat context menu. It offers one scope at a time: **Global** appears across profiles and
spaces, **Profile** stays in the Pinned section below the owning profile's Space tiles, and **Space** stays in the
chat's assigned space. Only that space is offered. Pinning never moves a chat.
Chats outside spaces can use Global or Profile. Removing a space assignment returns
its space pin to the profile level. **Unpin** keeps the chat's placement.

The tile's overflow menu offers rename and delete. You can also drag tiles to
reorder them. Deleting a space returns its threads and pins directly to the profile;
**Undo** restores the space. Moving a project to another profile clears its old space
assignments without deleting threads or removing pins.

On web and desktop, moving chats between Spaces, removing their assignment, and moving projects
between profiles show a destination confirmation with **Undo**. Undo preserves unrelated later
edits; if the same placement has changed again, it explains the conflict. Settling a chat also
shows **Undo**, which reopens it while that settlement is still current.

Spaces sync with profile settings. On web and desktop, the selected Space is remembered separately
for each profile on the current client, including All chats.
Archived and snoozed threads retain their assignments and existing visibility rules.
The dashboard supports a Space filter, space labels, and **By space** grouping. Its counts,
active lanes, and historical views use the selected space together with the other filters.
Spaces are available on web, desktop, and mobile.

To reorder spaces, drag a tile to its new position. With a tile focused, hold Alt
and use the arrow keys to move it through the grid. The tile menu contains Rename
and Delete space.

The profile options button beside the profile strip opens New profile, Edit current
profile, and Manage profiles. New profiles are selected immediately, with an Add project
action below. Manage profiles includes renaming, colors, ordering, and deletion.
The options button remains available before you create your first profile.

### New-chat defaults for a Space

Use the plus on a Space tile to preview where a new chat will run. The compact
menu shows the device and folder. Click that destination to open a fresh draft
in the Space; no message is sent automatically.

On web and desktop, the plus and overflow menu remain available when the shared profile
source is unavailable. They explain which source to connect or update, or where to resolve
conflicting sources. Saving changes and opening a chat in the Space require that source,
because the new chat's Space assignment is saved there. The controls become available
again when the source is ready.

On mobile, tapping a blocked Space action explains the restriction and offers the shared
source chooser. Saved destinations can still be previewed while the source is unavailable.

Choose any connected device, then search saved projects or browse its folders. The
folder does not need to be an existing project. **Save & open chat** saves the shortcut
and opens its first draft. To start in a new folder on web or desktop, browse to its parent,
choose **New folder**, enter a name, and choose **Use new folder**. The destination is
created on the selected device when you save; cancelling leaves its filesystem unchanged.
Creating a space offers this setup immediately; dismiss it
to keep an empty space without a default location. The settings button lets you change
or reset these defaults. Optional model and
workspace choices override the project's defaults for future chats only.
Existing chats keep their original device, folder, model, and workspace.

A Space can contain chats from any project in its parent profile, regardless of
its new-chat defaults. An unavailable device or folder blocks launching until
it is available again or you choose another destination.

### Choosing where a chat starts

The sidebar pencil and the New thread shortcut open the same compact chooser, even
with one project. It starts with your current device and folder. Press Enter to open,
or change the location, profile or space first. A selected space is preselected;
**Unsorted** keeps the chat directly under its profile. Shift-click keeps the
shortcut for creating in the current project.

The device selector includes devices without saved projects. Browse folders with a
path such as `~/Documents/` and drill into subfolders. The displayed folder is selected
automatically once it loads. Choose **Open chat** or **Save & open chat** to continue.
An existing checkout is reused. Moving a checkout from another profile asks for
confirmation because its existing chats move with it.

Select the project name in an unsent draft, or its sidebar **Move draft** button,
to change its location and space. The same composer keeps its text and attachments.
After a reload, files held only by the original device must be attached again before
a move to another device; T3 keeps the original draft intact until then.
Space tiles count unsent drafts with content separately from threads.

## On iPhone

The profile strip and space grid appear above the chat list. Tap a profile to switch;
tap a selected space again to return outside spaces. Use the profile menu to create,
rename, reorder, or delete profiles and move projects. Space menus offer rename,
reorder, defaults, and deletion with Undo. Long-press a chat to choose its pin scope
or move it to another space in the same profile.

The plus on a space previews its saved device and folder. Open a draft there, or
choose another destination with the normal device and folder picker, including
folders that are not saved projects yet. The new-task screen shows the destination
profile and space and can save the chosen device, folder, model, and workspace as
the space's shortcut. Starting a chat sends only when you submit your prompt.

Bookmark an open chat with the bookmark button. **Focus saved chat** alternates
between that chat and the chat you came from, selecting the destination profile
and space each time. On iPad it also opens the sidebar.

Open **Dashboard** from the profile menu to see tasks by state and filter by device,
project, provider, profile, or space. Pull requests are browsed per device, with
project and involvement filters. Open an associated chat or review the PR on its
hosting service. Files, diffs, and agent approvals remain available inside chats.

### Space overview

Selecting a space tile or its keyboard shortcut opens the same space in the main panel.
Chat navigation stays in the sidebar. Select the tile again to return to the overview;
Browser Back and Forward restore its profile and space selection.

The overview uses **folder** for a working directory on a particular device. Each associated
folder, including those with settled chats, has an expandable inspection panel:

- **Instructions:** rendered Markdown and source views for AGENTS.md and supported provider
  instruction files. Parent, folder-root, and subfolder sources remain separate. These are
  discovered files, not a claim about which instructions a particular provider loaded.
  Viewing them does not inject anything into chat context. Refresh rereads the selected file;
  Scan discovers added or removed files. Scan coverage lists exclusions and partial results.
- **Checkouts:** the folder checkout and worktrees used by this space. Agent activity includes
  conversations elsewhere that share the same device and checkout path. Shared-checkout notices
  identify potential overlap, not proven file conflicts. Path aliases may not be recognized.
- **Unfinished work:** live Git status, changed-file and upstream commit counts, expandable
  diffs, and linked PR checks when the host supplies them. No upstream and unavailable checks
  are shown explicitly. Inspecting work does not commit, push, or modify it.

Offline devices and unavailable folders remain visible. Folder panels load when expanded.
**New chat** starts with this space selected and a folder associated with it. The folder picker
lists all of the space's folders with their paths and devices. Changing spaces resets the folder;
an empty space asks you to choose one. **Browse** lets you choose or create another folder.
The space tile's plus button offers the same folder choices.

**Open in Finder** opens a folder on the device that owns it. Windows uses Explorer; other systems
use their available file manager. The action is disabled while that device is offline.

Devices running an older T3 server can show indexed instruction files. Scan coverage explains
when parent or ignored files are unavailable; update T3 on that device for complete discovery.
**Unsorted** and **All chats** use the same overview.

### Space branches

On web and desktop, **Branches** opens the selected space's Git graph. Choose a folder to read
its branches from the device that owns it. The folder selector includes its path and device;
identically named branches on different devices are never combined. Each overview folder also
has a **Branches** shortcut. **Overview** returns to instructions and checkout details.

Branch labels sit alongside commit history, with thin colored tracks and collapsed stretches
of older commits. Inactive merged branches are hidden initially; **Show merged** reveals them.
Branches with open checkouts or active chats remain visible. Search finds branches, commits,
paths, and associated chats, including collapsed history and hidden merged branches. The arrows
beside the search move between matches.

Select a branch for its checkout paths and related chats. Chats outside the selected space are
marked, and opening one reveals its own profile and space. Several branches at the same commit
share a row; the **+number** control reveals the additional branches. Commit selection opens its
changes and author details. A merge commit is compared with its first parent. Inspection does
not check out a branch or modify files.

The graph loads only while open, starting with 2,000 commits. **Load older commits** extends the
view up to 20,000. **Refresh** rereads local Git; returning to the window and staying active in
this view also refresh it periodically. It does not fetch remote repositories. Offline devices,
non-Git folders, and older servers show an explanation instead of substituting another device.


Each Space can keep a different new-chat folder for each device. Click its **+** to
see connected devices and their saved folders. Devices without a default stay visible
as compact **Choose folder** rows. Expand a row to pick an existing folder, browse any
path on that device, or create a folder inline. **Save** keeps the shortcut without
opening a chat; **Save & open** does both. Model and workspace defaults apply only to
that device. **Reset** clears only that device's shortcut. Saved offline devices remain
visible, and the existing single-device shortcut is retained automatically.

Per-device shortcuts sync through the shared profile device. Update that device to a
build supporting per-device defaults; otherwise changes remain saved locally with a
sync error rather than being sent to a server that would drop them.
