# Tasks and chat columns

A task records work you want to do. A chat is a conversation with an agent. Tasks can come from a call, a message, a thought, or an existing chat.

## Capture and prepare work

Use a Space tile's plus and choose **New task**. The same popover keeps **New chat** and its per-device folder defaults. It remembers your last choice. The dashboard and command palette open the same task capture. A Space supplies its profile and Space automatically; use Change only when you need a different assignment.

Write the request, paste screenshots, drop files, or use Attach. A title is generated from the first line; screenshots can be saved without text. Save task or close the capture to keep it. Closing an empty capture creates nothing. Folder, execution device, status, and chat choices can wait.

Captures keep text and original file bytes on this client before syncing. New captures sync to the shared profile source; both it and this client need task-capture support. An offline capture appears in Planned work with its sync state. Failed sync keeps the local copy and offers Retry. Existing tasks remain on their original storage device. The device storing a task can differ from the device where its chats run.

Open Task details when you are ready to work. Select an execution device and a folder belonging to the Space, or leave either undecided. **Save & create new chat** creates an idle conversation. A separate worktree is optional. **Use brief** in the chat inserts the brief, original request, links, and attachments into an empty composer for review; it never overwrites a draft or sends automatically.

**Create task from this chat** records where the request came from. That source link does not copy the entire conversation or send work to it. In Task details, **Prepare brief in** chooses the conversation that will prepare a handoff. It can replace an unavailable source and is independent of the source link. Preparation runs on the task's storage device. **Prepare brief with agent** runs a preparation turn there, waiting if the chat is busy. Cancel while queued; once running, use the chat's stop control. Review the brief before starting implementation.

A task can have several working chats, including chats on different devices. Record each chat's purpose and result, and unlink a chat without deleting it. A chat can also have several tasks; choose the task before using its brief. Folder choices stay scoped to the selected Space. Source links remain intact when execution changes.

Status is explicit: Parked, Ready, Working, or Done. A completed agent turn does not complete a task or settle a chat. Task details offers a local-time reminder; T3 shows it while open or when you return. Use Move to top in a task's menu to order pending work.

Delete task moves it to Trash. Undo or open Trash to restore it. Deletion does not stop, settle, or delete linked chats. Editing an existing task uses Save task; adding an attachment does not silently save your edits. Closing preserves an editing draft on this client.

Connected agents have `task_list`, `task_create`, and `task_update` tools for tasks stored on their environment and captured from, linked to, or being prepared in their chat. Providers must support the app's MCP connection. Unsupported providers can return a brief for you to save manually. Linking a chat on another device does not give its agent remote access to the task store.

## Monitor chats side by side

Switch between **Chat** and **Columns** in the main toolbar. Chat restores the last single conversation and the usual sidebar. Columns replaces the chat list with a compact navigation rail; Dashboard, profiles and Spaces, account/T3 Connect, Usage, and Settings remain accessible. **Choose chats** opens a temporary side panel; close it with Done or Escape to return to the board. Visiting a Space opens its overview without changing the board.

Global, profile, and Space dashboards remember your preferred chat mode on this device. **Open chats in** changes that preference while you stay on the dashboard. Opening a chat in Columns focuses it if present or appends it to your current board, preserving the arrangement. Settled and archived chats open as references without changing their status. A return link names the dashboard you came from and restores its filters and reading position. **Open board** resumes your arrangement without selecting another chat.

**Columns** opens the same independent workspace from any profile or Space. Use **Choose chats** to filter by profile, Space, device, or folder, then select conversations. Changing these filters never removes existing selections. Enable **Show settled chats** to add a reference conversation. Mixing chats never changes their assignment.

**New chat** creates an editable draft directly on the board using the usual folder and device picker. Nothing is sent until you submit a message. Unsent drafts are local to this client; another device can open the conversation once it has been started.

Start with one board named Columns. Use its menu to rename it, create another board, duplicate an arrangement, or delete an extra board. Board names, selected chats, order, and individual widths are saved on the shared profile source and update on connected clients. Both clients and the shared source need a version that supports shared boards. Reconnect the source to edit an arrangement while it is offline. Conflicting edits to the same board are rejected so another device's changes are not overwritten.

Existing device-local arrangements are imported as separate named boards when each updated client first opens Columns. Their original local settings are retained. The selected board, reading positions, and unsent drafts remain local to each client.

Drag each column's right edge to resize it independently. You can also focus the resize edge and use the arrow keys. Double-click an edge to restore its default width, or use **Equal widths** to reset every column. Smaller windows scroll horizontally without changing saved widths. Expand one chat and return to the board afterward. The column menu lets you reorder chats, create a task from a chat, or keep a chat on the board after you settle it. Keeping a column does not pin the chat in the sidebar. Unavailable chats retain their place until their device reconnects.

Only the focused column receives global composer shortcuts. Offscreen columns release their rendered chat views. Use Profile overview or Space overview for scoped activity, and Folders to inspect instructions and checkouts.

Quick capture, local screenshot recovery, Trash, and multiple working chats are available in web and desktop. The phone retains its existing task workflow; editing tasks with newer fields requires a compatible client. The multi-column workspace is available in web and desktop layouts.

## Inspect a Space

Click a profile to open its **Profile overview**, including all its Spaces and Unsorted chats. The Profile overview button above the Space tiles returns to this view. Click a Space to open its **Space overview**; the same button stays available beside Folders and Columns while reading chats. These overview entries clear narrower filters for their scope. **All chats** filters the sidebar list without changing the main view. The permanent Global dashboard button in the sidebar, or Cmd+Shift+H on macOS, opens all profiles and Spaces and clears device, folder, provider, search, and Git narrowing. Saved views remain available. Scope, device, folder, provider, and Git filters remain visible; saved views preserve combinations you reuse.

**Folders** shows associated folders, instruction file lists, and checkout state directly. Select an instruction file to read it. Paths and scope distinguish parent, folder-level, and nested instructions. Branch graphs and the device's file manager remain available from each folder.
