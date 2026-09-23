# Tasks and chat columns

A task records work you want to do. A chat is a conversation with an agent. Tasks can come from a call, a message, a thought, or an existing chat.

## Capture and prepare work

Use a Space tile's plus and choose **New task**. The same popover keeps **New chat** and its per-device folder defaults. It remembers your last choice. The dashboard and command palette open the same task capture. A Space supplies its profile and Space automatically; use Change only when you need a different assignment.

Write the request, paste screenshots, drop files, or use Attach. A title is generated from the first line; screenshots can be saved without text. Save task or close the capture to keep it. Closing an empty capture creates nothing. Folder, execution device, status, and chat choices can wait.

Captures keep text and original file bytes on this client before syncing. New captures sync to the shared profile source; both it and this client need task-capture support. An offline capture appears in Planned work with its sync state. Failed sync keeps the local copy and offers Retry. Existing tasks remain on their original storage device. The device storing a task can differ from the device where its chats run.

Open Task details when you are ready to work. **Gather context from a chat** is optional: choose a conversation and select **Prepare context** to ask its agent for a brief. This runs a preparation turn on the task's storage device, waiting if the conversation is busy. Cancel while queued; once running, use that chat's stop control. Review and edit the prepared context, or write it yourself.

**Take this up** chooses where the actual work will happen: a new chat or an existing chat. Choose an execution device and a folder belonging to the task's saved Space at this point. Opening the task from the global dashboard or Columns does not change that scope. Changing devices shows only that Space's folders on the selected device; an old linked chat never adds unrelated folders to the picker. A separate worktree is optional for a new chat. **Review in chat** loads the request, prepared context, source links, and attachments into the composer. It never overwrites an existing draft or sends automatically. It respects your Chat or Columns mode.

The task stays in **Planned work** while you review the draft. Sending that message moves it to **In chat** and out of Planned work. A compact link on the handoff message opens its task details. There is no persistent task banner above the conversation. If you abandon the draft, the task remains planned.

Use **Complete task** in task details or beside the chat's review controls when the work is finished. Completion keeps the original request, attachments, chat links, handoff messages, and available results in **Task history** below chat activity. A completed agent turn does not complete a task or settle a chat. **Return to planned** reopens the task while preserving its history. **Continue in another chat** adds a further handoff without losing the previous one.

**Create task from this chat** records where the request came from. The source link does not copy the whole conversation or send work to it. The chat used to gather context and the chat used to perform the work can be different. A task can span several chats and devices, and one chat can handle several tasks.

Task details offers a local-time reminder; T3 shows it while open or when you return. Use Move to top in a task's menu to order pending work. Delete task moves it to Trash, where it can be restored. Deletion does not stop, settle, or delete linked chats. **Save changes** saves edits to an existing task; adding an attachment does not silently save your other edits. Closing preserves an editing draft on this client.

The dashboard groups visible filters by scope, matching criteria, and view. Planned tasks use compact cards in a bounded area, so a backlog does not push chat activity out of reach. Task history and settled chats each have their own disclosure below activity.

Connected agents have `task_list`, `task_create`, and `task_update` tools for tasks stored on their environment and captured from, linked to, or being prepared in their chat. Providers must support the app's MCP connection. Unsupported providers can return a brief for you to save manually. Linking a chat on another device does not give its agent remote access to the task store.

## Monitor chats side by side

Switch between **Chat** and **Columns** in the main toolbar. Chat restores the last single conversation and the usual sidebar. Columns replaces the chat list with a compact navigation rail; Dashboard, profiles and Spaces, account/T3 Connect, Usage, and Settings remain accessible. **Choose chats** opens a temporary side panel; close it with Done or Escape to return to the board. Visiting a Space opens its overview without changing the board.

Global, profile, and Space dashboards remember your preferred chat mode on this device. **Open chats in** changes that preference while you stay on the dashboard. Opening a chat in Columns focuses it if present or appends it to your current board, preserving the arrangement. Settled and archived chats open as references without changing their status. A return link names the dashboard you came from and restores its filters and reading position. **Open board** resumes your arrangement without selecting another chat.

**Columns** opens the same independent workspace from any profile or Space. Use **Choose chats** to filter by profile, Space, device, or folder, then select conversations. Changing these filters never removes existing selections. Enable **Show settled chats** to add a reference conversation. Mixing chats never changes their assignment.

The column toolbar provides the same chat actions, scoped pins, snooze, settlement, renaming, bookmarks, Git actions, folder tools, and scripts as Chat mode. Review actions are available beside task capture. Workspace tools open in a drawer at narrow column widths, so they do not squeeze the conversation. Task capture preserves selected text or the composer's draft and attachments.

The rail includes chat and message search, saved-chat focus, pull requests, usage, settings, and Account and T3 Connect. Search results, new chats from Space shortcuts, and forked chats open on your selected board when Columns is active. The existing arrangement stays intact. A draft's column menu also offers **Move draft** and **Discard draft**.

**New chat** creates an editable draft directly on the board using the usual folder and device picker. Nothing is sent until you submit a message. Unsent drafts are local to this client; another device can open the conversation once it has been started.

Start with one board named Columns. Use its menu to rename it, create another board, duplicate an arrangement, or delete an extra board. Board names, selected chats, order, and individual widths are saved on the shared profile source and update on connected clients. Both clients and the shared source need a version that supports shared boards. Reconnect the source to edit an arrangement while it is offline. Conflicting edits to the same board are rejected so another device's changes are not overwritten.

Older device-local arrangements are available under **Previous layouts** in the board picker. Empty and duplicate imports are omitted without deleting the original records. Rename a recovered layout to keep it among your saved boards. The selected board, reading positions, and unsent drafts remain local to each client.

Drag each column's right edge to resize it independently. You can also focus the resize edge and use the arrow keys. Double-click an edge to restore its default width, or use **Equal widths** to reset every column. Smaller windows scroll horizontally without changing saved widths. Expand one chat and return to the board afterward. Use **New task** in a chat to capture more work, even when that chat already has a task. The column menu lets you reorder chats or keep a chat on the board after you settle it. Keeping a column does not pin the chat in the sidebar. Unavailable chats retain their place until their device reconnects.

**Mark reviewed** applies to the result in that column and leaves the chat open. Click **Reviewed** to return it to Ready to review. Columns do not advance a review queue; choose another visible chat or return to the dashboard.

Only the focused column receives global composer shortcuts. Offscreen columns release their rendered chat views. Use Profile overview or Space overview for scoped activity, and Folders to inspect instructions and checkouts.

Quick capture, local screenshot recovery, Trash, and multiple working chats are available in web and desktop. The phone retains its existing task workflow; editing tasks with newer fields requires a compatible client. The multi-column workspace is available in web and desktop layouts.

## Inspect a Space

Click a profile to open its **Profile overview**, including all its Spaces and Unsorted chats. The Profile overview button above the Space tiles returns to this view. Click a Space to open its **Space overview**; the same button stays available beside Folders and Columns while reading chats. These overview entries clear narrower filters for their scope. **All chats** filters the sidebar list without changing the main view. The permanent Global dashboard button in the sidebar, or Cmd+Shift+H on macOS, opens all profiles and Spaces and clears device, folder, provider, search, and Git narrowing. Saved views remain available. Scope, device, folder, provider, and Git filters remain visible; saved views preserve combinations you reuse.

**Folders** shows associated folders, instruction file lists, and checkout state directly. Select an instruction file to read it. Paths and scope distinguish parent, folder-level, and nested instructions. Branch graphs and the device's file manager remain available from each folder.

In Columns mode, **Profiles and spaces** opens a floating navigator with the same profile strip
and Space tile grid as Chat mode. Swipe horizontally to browse profiles without changing the
board. Choose **Profile overview** or a Space tile to visit its dashboard. Tile plus buttons
support quick task capture and per-device chat folders, including creating a folder. Space
menus and profile options remain available. Escape or clicking outside closes the navigator.
