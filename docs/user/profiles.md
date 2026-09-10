# Profiles

A profile is a named, colored group of projects shown in the sidebar, similar to browser profiles.
Use profiles to separate work by client, team, or context so the sidebar only shows the projects
that matter right now.

Use **Show current chat** beside the new-chat button to return the sidebar to the open chat.
It selects that chat's profile and space, clears search and project filters, and scrolls to
the highlighted chat. Chats without a space select **Default**; projects without a
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
through a direct link. The currently open thread stays open when you switch profiles.

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

All participating clients and the source need a build supporting shared profiles. Keep the source
connected to edit organization. If it disconnects, the last displayed collection is cached and
read-only until it reconnects. Chats still use their normal host connections; profile sharing does
not copy files, transfer execution, grant permissions, or connect an unpaired device automatically.
Use **All** and the normal new-chat picker to work without changing organization when the source
is unavailable.

Edits are saved on the source and delivered through the live connection. Independent changes can
be combined, including two clients adding chats to the same space. Competing changes to the same
field or placement are rejected with a retry message instead of silently overwriting either edit.

## Spaces

Spaces organize threads within a profile. Click **New space** beside the Spaces heading,
enter a name, and press Enter. Each tile shows its chat count. **Default** is always the
first tile and contains chats without a Space assignment. It also appears in **All**, where
it collects unassigned chats across profiles. Default cannot be renamed or deleted.
Select a named tile to show its chats. Click it again to return to Default. Switching to
a profile selects Default. Creating a Space does not select it or hide unassigned chats.
Use **All chats** beside the Spaces heading to include both assigned and unassigned chats.
An empty selected view also offers **Show all threads**.
On web and desktop, **Filter chats by project** narrows the selected view. Its clear button
restores all projects. Choosing a Space or switching profiles clears that project filter.
Assigning a project to a profile does not assign its chats to a same-named space.
Profile pins stay above the grid. A dot on a tile indicates work that needs attention.

Use the tag button on a chat row or its **Move to space** context-menu action to choose
a space. These work in All as well as a specific profile. Choose **Default** to
remove a space assignment. If the project has no profile, the dialog lets you choose one
first and explains that moving a project changes the profile of all its chats.
On web and desktop, drag the tag icon to a named Space tile to assign selected chats.
Drag the row itself to reorder it or move it between Pinned, Active, and Settled.
The **Pin** submenu offers one scope at a time: **Global** appears across profiles and
spaces, **Profile** stays above the owning profile's grid, and **Space** stays in the
chat's assigned space. Only that space is offered. Pinning never moves a chat.
Chats outside spaces can use Global or Profile. Removing a space assignment returns
its space pin to the profile level. **Unpin** keeps the chat's placement.

The tile's overflow menu offers rename and delete. You can also drag tiles to
reorder them. Deleting a space returns its threads and pins directly to the profile;
**Undo** restores the space. Moving a project to another profile clears its old space
assignments without deleting threads or removing pins.

Spaces sync with profile settings. The sidebar space selection is temporary; switching profiles returns to chats outside spaces.
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

Choose any connected device, then search saved projects or browse its folders. The
folder does not need to be an existing project. **Save & open chat** saves the shortcut
and opens its first draft. Creating a space offers this setup immediately; dismiss it
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
**Default** keeps the chat directly under its profile. Shift-click keeps the
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

**Show in list** in an open chat selects its profile and space and reveals it in the
chat list. On iPhone this returns to the list; on iPad it opens the sidebar.

Open **Dashboard** from the profile menu to see tasks by state and filter by device,
project, provider, profile, or space. Pull requests are browsed per device, with
project and involvement filters. Open an associated chat or review the PR on its
hosting service. Files, diffs, and agent approvals remain available inside chats.
