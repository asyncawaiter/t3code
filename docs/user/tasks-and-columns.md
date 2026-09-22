# Tasks and chat columns

A task records work you want to do. A chat is a conversation with an agent. Tasks can come from a call, a message, a thought, or an existing chat.

## Capture and prepare work

Use **New task** on the dashboard or in the command palette. **Create task from this chat** saves a separate task with a source-chat link; it does not send work to that chat. Add the outcome and original request. Profile, Space, folder, source links, and a chat are optional. Tasks are saved on the chosen device and visible to its connected clients. Unsaved captures stay on the client where you wrote them.

After selecting a Space, the folder picker offers only its folders on the chosen
device, including configured default folders. Choose later if no folder is ready.

Paste screenshots anywhere in the capture form, drop files, or use Attach files. Images have thumbnails and a full-size preview. Save the task to retain its attachments; unfinished uploads expire after 24 hours. Saving does not submit a prompt. Status is explicit: parked, ready, working, or done. A completed agent turn does not mark the task done.

**Prepare brief with agent** queues a preparation turn in the source or linked chat. It waits while that chat is busy. The agent is asked to save a handoff containing relevant decisions, files, questions, and a first step. Review the brief before implementation. Cancel queued preparation from the task. Once it starts, use the chat's normal stop control.

**Save & create new chat** under Chat preparation creates a conversation in the chosen folder and Space. Choose a separate worktree when the task should have its own checkout, or link an existing chat. The new chat stays idle. **Use brief** puts the request and attachments into the composer for review before sending. It preserves an existing composer draft.

Connected agents have `task_list`, `task_create`, and `task_update` tools for tasks originating in or linked to their chat. These tools do not require browser access. Providers must support the app's MCP connection. Unsupported providers can still return a brief for you to save manually.

## Monitor chats side by side

**Columns** opens the same independent workspace from any profile or Space. Use **Choose chats** to filter by profile, Space, device, or folder, then select conversations. Changing these filters never removes existing selections. Enable **Show settled chats** to add a reference conversation. Mixing chats never changes their assignment.

Start with one board named Columns. Use its menu to rename it, create another board, duplicate an arrangement, or delete an extra board. Board names, selected chats, order, and individual widths are saved on the shared profile source and update on connected clients. Both clients and the shared source need a version that supports shared boards. Reconnect the source to edit an arrangement while it is offline. Conflicting edits to the same board are rejected so another device's changes are not overwritten.

Existing device-local arrangements are imported as separate named boards when each updated client first opens Columns. Their original local settings are retained. The selected board, reading positions, and unsent drafts remain local to each client.

Drag each column's right edge to resize it independently. You can also focus the resize edge and use the arrow keys. Double-click an edge to restore its default width, or use **Equal widths** to reset every column. Smaller windows scroll horizontally without changing saved widths. Expand one chat and return to the board afterward. The column menu lets you reorder chats, create a task from a chat, or keep a chat on the board after you settle it. Keeping a column does not pin the chat in the sidebar. Unavailable chats retain their place until their device reconnects.

Only the focused column receives global composer shortcuts. Offscreen columns release their rendered chat views. Use Profile overview or Space overview for scoped activity, and Folders to inspect instructions and checkouts.

The phone dashboard supports task capture, editing, screenshot selection or clipboard paste, status, brief preparation, and opening a prepared or linked chat with its context and attachments. The multi-column workspace is available in web and desktop layouts.

## Inspect a Space

Click a profile to open its **Profile overview**, including all its Spaces and Unsorted chats. The Profile overview button above the Space tiles returns to this view. Click a Space to open its **Space overview**; the same button stays available beside Folders and Columns while reading chats. These overview entries clear narrower filters for their scope. **All chats** filters the sidebar list without changing the main view. The permanent Global dashboard button in the sidebar, or Cmd+Shift+H on macOS, opens all profiles and Spaces and clears device, folder, provider, search, and Git narrowing. Saved views remain available. Scope, device, folder, provider, and Git filters remain visible; saved views preserve combinations you reuse.

**Folders** shows associated folders, instruction file lists, and checkout state directly. Select an instruction file to read it. Paths and scope distinguish parent, folder-level, and nested instructions. Branch graphs and the device's file manager remain available from each folder.
