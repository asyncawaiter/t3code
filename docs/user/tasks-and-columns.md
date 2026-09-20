# Tasks and chat columns

A task records work you want to do. A chat is a conversation with an agent. Tasks can come from a call, a message, a thought, or an existing chat.

## Capture and prepare work

Use **Capture task** on the dashboard or a Space, **+ Task** in a chat, or **Capture a task** in the command palette. Add the outcome and original request. Profile, Space, folder, source links, and a chat are optional. Tasks are saved on the chosen device and visible to its connected clients. Unsaved captures stay on the client where you wrote them.

Paste screenshots anywhere in the capture form, drop files, or use Attach files. Images have thumbnails and a full-size preview. Save the task to retain its attachments; unfinished uploads expire after 24 hours. Saving does not submit a prompt. Status is explicit: parked, ready, working, or done. A completed agent turn does not mark the task done.

**Prepare brief with agent** queues a preparation turn in the source or linked chat. It waits while that chat is busy. The agent is asked to save a handoff containing relevant decisions, files, questions, and a first step. Review the brief before implementation. Cancel queued preparation from the task. Once it starts, use the chat's normal stop control.

**Save & prepare chat** under Chat preparation creates a conversation in the chosen folder and Space. Choose a separate worktree when the task should have its own checkout, or link an existing chat. The new chat stays idle. **Use brief** puts the request and attachments into the composer for review before sending. It preserves an existing composer draft.

Connected agents have `task_list`, `task_create`, and `task_update` tools for tasks originating in or linked to their chat. These tools do not require browser access. Providers must support the app's MCP connection. Unsupported providers can still return a brief for you to save manually.

## Monitor chats side by side

Select **Chat columns** on a Space to see its active chats beside one another. Scroll horizontally, choose which chats to include, reorder columns, or keep a settled conversation visible as a reference. Expand a chat to focus on it and return to the columns afterward.

Only the focused column receives global composer shortcuts. Drafts and reading positions survive moving between columns. Offscreen columns release their rendered chat views. Layout choices stay on the viewing device.

**Monitor Spaces** shows compact rows across Spaces. Select a row or chat to open its columns. Use the Space rail to change rows; arrow keys work while the rail has focus, and vertical trackpad scrolling over the rail changes Spaces. Scrolling inside a conversation stays within that conversation.

The phone dashboard supports task capture, editing, screenshot selection or clipboard paste, status, brief preparation, and opening a prepared or linked chat with its context and attachments. The multi-column workspace is available in web and desktop layouts.
