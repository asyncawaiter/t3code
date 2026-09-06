# Profiles

A profile is a named, colored group of projects shown in the sidebar, similar to browser profiles.
Use profiles to separate work by client, team, or context so the sidebar only shows the projects
that matter right now.

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

Profiles and spaces use one shared source device. Every connected desktop and web client reads
the same collection, including names, ordering, project assignments, space membership, new-chat
defaults, and pin scopes. Pin status and pin order continue to stream from each chat's host.
The selected profile, search, scroll position, and open chat stay independent on each client.
Unsent drafts stay on the client where you compose them. Mobile does not show profiles yet.

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
enter a name, and press Enter. Each named tile shows its thread count. Select a tile to
show its threads below the grid. Click the selected tile again to return to **Outside spaces**.
No space is selected when you open the app or switch profiles. The default view shows chats
outside spaces. Creating a space does not select it or hide those chats.
The view picker beside Spaces offers **All threads** and **Outside spaces**, which shows only
chats without a space. An empty selected view also offers **Show all threads**.
Assigning a project to a profile does not assign its chats to a same-named space.
Profile pins stay above the grid. A dot on a tile indicates work that needs attention.

Use the tag button on a chat row or its **Move to space** context-menu action to choose
a space. These work in All as well as a specific profile. Choose **Outside spaces** to
remove a space assignment. If the project has no profile, the dialog lets you choose one
first and explains that moving a project changes the profile of all its chats.
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
Spaces are available on web and desktop; mobile does not expose them yet.

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
**Outside spaces** keeps the chat directly under its profile. Shift-click keeps the
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
