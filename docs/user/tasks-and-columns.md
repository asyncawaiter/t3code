# Tasks and chat columns

A task records work you want to do. A chat is a conversation with an agent. Tasks can come from a call, a message, a thought, or an existing chat.

## Capture and prepare work

Use a Space tile's plus and choose **New task**. The same popover keeps **New chat** and its per-device folder defaults. It remembers your last choice. The dashboard and command palette open the same task capture. A Space supplies its profile and Space automatically; use Change only when you need a different assignment.

Write the request, paste screenshots, drop files, or use Attach. A title is generated from the first line; screenshots can be saved without text. Save task or close the capture to keep it. Closing an empty capture creates nothing. Folder, execution device, status, and chat choices can wait.

Captures keep text and original file bytes on this client before syncing. New captures sync to the shared profile source; both it and this client need task-capture support. An offline capture appears in Planned work with its sync state. Failed sync keeps the local copy and offers Retry. Existing tasks remain on their original storage device. The device storing a task can differ from the device where its chats run.

Open Task details when you are ready to work. **Gather context from a chat** is optional: choose a conversation and select **Prepare context** to ask its agent for a brief. This runs a preparation turn on the task's storage device, waiting if the conversation is busy. Cancel while queued; once running, use that chat's stop control. Review and edit the prepared context, or write it yourself.

**Take this up** chooses where the actual work will happen: a new chat or an existing chat. Choose an execution device and a folder belonging to the task's saved Space at this point. Opening the task from the global dashboard or Columns does not change that scope. Changing devices shows only that Space's folders on the selected device; an old linked chat never adds unrelated folders to the picker. A separate worktree is optional for a new chat. **Review in chat** loads the request, prepared context, source links, and attachments into the composer. It never overwrites an existing draft or sends automatically. It respects your Chat or Columns mode.

The task stays in **Planned work** while you review the draft. Sending that message moves it to **In chat** and out of Planned work. A compact link on the handoff message opens its task details. There is no persistent task banner above the conversation. If you abandon the draft, the task remains planned.

Use **Complete task** in task details or beside the chat's review controls when the work is finished. Completion keeps the original request, attachments, chat links, handoff messages, and available results in **Task history**, available beside the Chat activity heading. A completed agent turn does not complete a task or settle a chat. **Return to planned** reopens the task while preserving its history. **Continue in another chat** adds a further handoff without losing the previous one.

**Create task from this chat** records where the request came from. The source link does not copy the whole conversation or send work to it. The chat used to gather context and the chat used to perform the work can be different. A task can span several chats and devices, and one chat can handle several tasks.

Task details offers a local-time reminder; T3 shows it while open or when you return. Use Move to top in a task's menu to order pending work. Delete task moves it to Trash, where it can be restored. Deletion does not stop, settle, or delete linked chats. **Save changes** saves edits to an existing task; adding an attachment does not silently save your other edits. Closing preserves an editing draft on this client.

The dashboard keeps all five chat states visible. Scroll each state independently to monitor many agents without moving the rest of the board. Use Compact to scan chats, expand an individual card for its context, or switch to Detailed for all cards. Card detail and the Planned work shelf's collapsed state are remembered on this device. Returning from a chat restores the dashboard's lane positions. All filters stay visible above the board, grouped into Scope, Environment, Git, and Display. Planned work shows one horizontal row of task cards, with Space filters above it. A Space dashboard already supplies that scope. Select a card to widen it in place; neighbouring cards move sideways while the row keeps its height. Context, files, preparation, chat destination, and other actions stay inside the expanded card. Only one card is expanded at a time, and unsaved edits survive closing and reopening it. Scroll horizontally or use the previous and next arrows to browse tasks. Settled chats and Task history open in a searchable side drawer without resizing the active columns. The drawer also provides Snoozed and Archived chats, and follows the dashboard scope.

Connected agents have `task_list`, `task_create`, and `task_update` tools for tasks stored on their environment and captured from, linked to, or being prepared in their chat. Providers must support the app's MCP connection. Unsupported providers can return a brief for you to save manually. Linking a chat on another device does not give its agent remote access to the task store.

## Monitor chats side by side

The **Conversation layout** button at the bottom of the left navigation selects Chat or Columns. On a dashboard it changes how conversations open without leaving the dashboard. Chat keeps its existing sidebar and overview navigation.

In Columns, **Spaces** and **Boards** are separate destinations in the left rail. Choose a Space tile to open its live conversations side by side. **Chats** and **Dashboard** stay beside the Space name in both views and switch between that Space's conversations and its scoped overview. Dashboard cards return to Chats and focus the selected conversation. These visits do not change a saved board.

A Space's live view includes idle and reviewed conversations as well as running work. New chats appear automatically; settled, archived, snoozed, and moved-out chats leave the active view. **New chat** keeps the current Space selected. **Hide** removes a column from this view only; **Hidden** restores it. Space column order, widths, and hidden choices are remembered on this client. **Settled** offers **Resume chat** to reactivate work or **Open as reference** to read without changing its status. **Snoozed** similarly offers **Wake chat**. Reference columns can be closed and last for the current visit.

**Boards** opens a compact picker of your saved collections, with **New board** at the top. A custom board contains only chats you explicitly add and can mix profiles, Spaces, folders, and devices. Use **Add existing chat** to search and select conversations in a dialog. Enable **Include settled chats** for persistent references. Removing a column never changes its Space assignment.

The column toolbar provides the same chat actions, scoped pins, snooze, settlement, renaming, bookmarks, Git actions, folder tools, and scripts as Chat mode. Review actions are available beside task capture. Workspace tools open in a drawer at narrow column widths, so they do not squeeze the conversation. Task capture preserves selected text or the composer's draft and attachments.

The rail includes chat and message search, saved-chat focus, pull requests, usage, settings, and Account and T3 Connect. Space navigation opens its live workspace. Finding an existing chat through the dashboard, search, saved-chat locator, task links, or notifications returns to its remembered Columns destination. These actions never add it to the board you happen to be viewing. Use Add existing chat to change a board's membership. A draft's column menu also offers **Move draft** and **Discard draft**.

**New chat** creates an editable draft directly on the board using the usual folder and device picker. Nothing is sent until you submit a message. Unsent drafts are local to this client; another device can open the conversation once it has been started.

Drag the grip beside a column title to reorder columns. Focus the grip and press Left or Right for keyboard reordering. Actions > Column arrangement remains available. The saved order updates across connected clients for custom boards; Space arrangements stay local.

Start with one board named Columns. Use **Manage** to rename it, create another board, duplicate an arrangement, or delete an extra board. Board names, selected chats, order, and individual widths are saved on the shared profile source and update on connected clients. Both clients and the shared source need a version that supports shared boards. Reconnect the source to edit an arrangement while it is offline. Conflicting edits to the same board are rejected so another device's changes are not overwritten.

The selected board, reading positions, and unsent drafts remain local to each client.

In Columns mode, dashboard cards show where they will open. Clicking a card or using Focus saved chat returns to the board or Space where you last interacted with that chat, and brings its column into view. Mouse interaction, keyboard navigation between columns, and creating a chat record that destination. Simply displaying a chat in another board does not change it. Drafts retain their destination when started or moved to another device. This memory stays on this client.

Hover or focus the destination label for an explanation: a remembered destination says **Last used here**, while a default destination says where it opens. **Open in...** appears with the card's secondary actions and lets you choose its own Space, an existing board containing it, or All chats. The last-used location is marked. Choosing a destination updates this client's memory without adding the chat to a board.

If the previous board was deleted or the chat was removed, the chat opens in its own Space, or All chats when it has no assigned profile. A notification explains the fallback. An unavailable shared profile device does not erase the remembered board. Reconnect it using the notification's **Connections** action.

The saved-chat locator also checks archived chats. An archived reference stays archived, with a notification explaining that state. If the chat's device is offline, reconnect it; the bookmark is kept. If the connected device no longer has the chat, the locator explains that it may have been deleted and offers **Remove bookmark**. A failed lookup does not silently clear a bookmark.

Use **Return to Global dashboard** or the scoped dashboard return button to restore the filters, Compact or Detailed setting, and independent lane positions from your departure. The originating card receives focus. If the chat became settled or snoozed, a notification offers to show that state instead of changing your filters automatically. The permanent Global dashboard rail button remains a fresh, unfiltered entry.

Drag each column's right edge to resize it independently. You can also focus the resize edge and use the arrow keys. Double-click an edge to restore its default width, or use **Reset widths** to reset every column. Smaller windows scroll horizontally without changing saved widths. Expand one chat and return to the board afterward. Use **New task** in a chat to capture more work, even when that chat already has a task. The column menu lets you reorder chats or keep a chat on the board after you settle it. Keeping a column does not pin the chat in the sidebar. Unavailable chats retain their place until their device reconnects.

**Mark reviewed** applies to the result in that column and leaves the chat open. Click **Undo review** to return it to Ready to review. Columns do not advance a review queue; choose another visible chat or return to the dashboard.

Only the focused column receives global composer shortcuts. Offscreen columns release their rendered chat views. Use Profile overview or Space overview for scoped activity, and Folders to inspect instructions and checkouts.

Quick capture, local screenshot recovery, Trash, and multiple working chats are available in web and desktop. The phone retains its existing task workflow; editing tasks with newer fields requires a compatible client. The multi-column workspace is available in web and desktop layouts.

## Inspect a Space

Click a profile to open its **Profile overview**, including all its Spaces and Unsorted chats. The Profile overview button above the Space tiles returns to this view. Click a Space to open its **Space overview**; the same button stays available beside Folders and Columns while reading chats. These overview entries clear narrower filters for their scope. **All chats** filters the sidebar list without changing the main view. The permanent Global dashboard button in the sidebar, or Cmd+Shift+H on macOS, opens all profiles and Spaces and clears device, folder, provider, search, and Git narrowing. Saved views remain available. Scope and applied filters remain visible; saved views preserve combinations you reuse.

**Folders** shows associated folders, instruction file lists, and checkout state directly. Select an instruction file to read it. Paths and scope distinguish parent, folder-level, and nested instructions. Branch graphs and the device's file manager remain available from each folder.

In Columns mode, hover over **Profiles and spaces** to open a floating navigator with the same profile strip
and Space tile grid as Chat mode. Swipe horizontally to browse profiles without changing the
board. Choose a Space tile to open its live columns, then use **Dashboard** for its overview. **Profile overview** still opens the profile dashboard. Tile plus buttons
support quick task capture and per-device chat folders, including creating a folder. Space
menus and profile options remain available. Hover over **Boards** to choose a custom board, then click its name to open it. Both pickers also open by click or keyboard. Moving away closes hover previews; Escape or clicking outside closes either picker. Dashboard and Search remain click-only.

Columns use a compact header with direct review controls. **Actions** contains conversation and workspace commands: rename, pin, snooze, settle, archive, project actions, editors, Git, and linked task actions. This menu uses the app appearance on Mac and web. New task remains available beside these controls.

Use **Manage** beside the board name to rename, duplicate, or create a board. Add existing chat opens a searchable dialog. Its folder choices follow the selected profile, Space, and device.

Column headers show labeled profile, space, project, device, branch, and workspace path details. Click a saved chat title to rename it; Enter saves and Escape cancels. Bookmark and Open folder are direct toolbar buttons. Opening folders is available on the local device. The Pin in Chat sidebar menu controls sidebar pin visibility (global, profile, or space); it does not change the saved selection or order of a Columns board.

Use Add existing chat and New chat together in the board toolbar to bring a saved conversation into the board or start a fresh one. The Conversation layout control changes between Chat and Columns independently of the Space or board destination.

Each column header separates conversation identity and status, workspace context, and actions. Status and review always sit together below the title. Settled describes the conversation, while Mark reviewed acknowledges its latest result; Undo review returns that result to review. Move left, Move right, and Keep on board when settled are under Actions > Column arrangement.

In Add existing chats, select conversations across searches and filters, then choose Add to save the batch. Existing columns stay in order; additions appear at the end and the first addition comes into view. Cancel, Escape, or closing the dialog discards the selection. Chats already on the board appear as Already added in search and cannot be removed here. Include settled chats to add persistent references. If saving fails, the dialog keeps your selection for retry.
