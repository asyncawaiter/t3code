import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as Schema from "effect/Schema";
import {
  AlertCircleIcon,
  CheckCheckIcon,
  Columns3Icon,
  EyeIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { BOARD_JUMP_KEYBINDING_COMMANDS, type ChatBoard } from "@t3tools/contracts";
import { useChatBoards } from "../../hooks/useChatBoards";
import { useChatColumnMemory } from "../../hooks/useChatColumnLocation";
import { getLocalStorageItem, useLocalStorage } from "../../hooks/useLocalStorage";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadShells } from "../../state/entities";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { requestComposerFocus } from "../../lib/composerFocusRequest";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import { useWorkflowState } from "../../workflowState";
import { cn } from "../../lib/utils";
import { toastManager } from "../ui/toast";
import { Kbd } from "../ui/kbd";
import { useColumnNavigation } from "./columnNavigation";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { primaryServerKeybindingsAtom, profileSourceAtom } from "../../state/server";
import { scoreChatPickerMatch } from "./chatPickerSearch";
import { useBoardsOverview } from "./BoardsOverviewHost";
import {
  assignHints,
  boardOverviewTiles,
  chatsNeedingInput,
  moveChatBetweenBoards,
} from "./columnState";

const Hints = Schema.Record(Schema.String, Schema.String);
const OptionalChatKey = Schema.NullOr(Schema.String);
const DRAG_TYPE = "application/x-t3-board-chat";

type Tile = ReturnType<typeof boardOverviewTiles>[number];
type Chat = Tile["chats"][number];

/**
 * The hint a key press names. `event.key` follows the keyboard layout, so it is used
 * whenever it is a plain letter or digit; Option (and Shift on digits) turn `key` into a
 * symbol on macOS, so those fall back to the physical key.
 */
function hintFromEvent(event: Pick<KeyboardEvent, "key" | "code">) {
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  return null;
}

function StatusLine({ chat, now }: { chat: Chat; now: string }) {
  if (!chat.status) return <span className="text-muted-foreground">Not connected</span>;
  if (chat.status === "Needs input")
    return (
      <span className="flex items-center gap-1 font-semibold">
        <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden />
        Needs input
      </span>
    );
  if (chat.status === "Running")
    return (
      <span className="flex items-center gap-1 font-medium">
        <PlayIcon className="size-3 shrink-0" aria-hidden />
        Running
        {chat.runningSince && (
          <span className="text-muted-foreground tabular-nums">
            {formatElapsedDurationLabel(chat.runningSince, Date.parse(`${now}Z`))}
          </span>
        )}
      </span>
    );
  if (chat.status === "Ready to review")
    return (
      <span className="flex items-center gap-1 font-medium">
        <EyeIcon className="size-3.5 shrink-0" aria-hidden />
        Ready to review
      </span>
    );
  if (chat.status === "Reviewed")
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <CheckCheckIcon className="size-3.5 shrink-0" aria-hidden />
        Reviewed
      </span>
    );
  return <span className="text-muted-foreground">{chat.status}</span>;
}

function MiniColumn(props: {
  chat: Chat;
  hint: string | undefined;
  now: string;
  selected: boolean;
  boardName?: string;
  onOpen: () => void;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  const { chat, hint } = props;
  const needsInput = chat.status === "Needs input";
  return (
    <button
      type="button"
      draggable={!!props.onDragStart}
      onDragStart={props.onDragStart}
      onClick={props.onOpen}
      aria-label={`${chat.title}${chat.status ? `, ${chat.status}` : ""}${hint ? `, key ${hint}` : ""}`}
      className={cn(
        "flex h-32 w-40 shrink-0 flex-col rounded-lg bg-card text-left text-card-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        needsInput ? "border-2 border-dashed border-foreground" : "border border-border",
        props.selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      <span className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        {hint ? (
          <kbd className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-background font-mono text-base font-bold uppercase leading-none">
            {hint}
          </kbd>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        {props.boardName && (
          <span className="min-w-0 truncate text-2xs text-muted-foreground">{props.boardName}</span>
        )}
        {props.selected && <Kbd className="ml-auto">Enter</Kbd>}
      </span>
      <span className="line-clamp-3 flex-1 px-2 pt-1.5 text-sm font-medium leading-snug">
        {chat.title}
      </span>
      <span className="px-2 pb-1.5 text-2xs">
        <StatusLine chat={chat} now={props.now} />
      </span>
    </button>
  );
}

/** Mission Control for custom boards: every board at a glance, one key to land in any chat. */
export default function BoardsOverview({
  onClose,
  currentBoard,
}: {
  onClose: () => void;
  currentBoard: string | null;
}) {
  const navigate = useNavigate();
  const boards = useChatBoards();
  const shells = useThreadShells();
  const reviewed = useWorkflowState((state) => state.reviewed);
  const { remember } = useChatColumnMemory();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const now = useNowMinute();
  const tiles = useMemo(
    () => boardOverviewTiles(boards.boards, shells, reviewed),
    [boards.boards, shells, reviewed],
  );
  const waiting = useMemo(() => chatsNeedingInput(tiles), [tiles]);

  const source = useAtomValue(profileSourceAtom);
  const [storedHints, setStoredHints] = useLocalStorage(
    `t3.boards-overview.hints.${source.sourceId}`,
    {},
    Hints,
  );
  const slots = useMemo(
    () => tiles.flatMap((tile) => tile.chats.map((chat) => chat.slot)),
    [tiles],
  );
  const hints = useMemo(() => assignHints(storedHints, slots), [storedHints, slots]);
  useEffect(() => {
    // Until the source's boards load, the list is a placeholder; saving it would wipe every letter.
    if (!source.config?.settings.chatBoards) return;
    if (JSON.stringify(hints) !== JSON.stringify(storedHints)) setStoredHints(hints);
  }, [hints, storedHints, setStoredHints, source.config?.settings.chatBoards]);

  const [query, setQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const matches = useMemo(() => {
    if (!query?.trim()) return null;
    return tiles.flatMap((tile) =>
      tile.chats.flatMap((chat) => {
        const score = scoreChatPickerMatch(chat.title, [tile.board.name], query);
        return score === null ? [] : [{ board: tile.board, chat, score }];
      }),
    );
  }, [tiles, query]);
  // Arrows walk the matches in the order they appear; the best one starts selected.
  const best = matches?.reduce(
    (top, match, index) => (match.score < matches[top]!.score ? index : top),
    0,
  );
  const selected = matches?.length ? (selection ?? best ?? 0) % matches.length : null;
  const selectedSlot = selected === null ? null : (matches?.[selected]?.chat.slot ?? null);

  const open = (
    board: ChatBoard,
    key?: string,
    options?: { expand?: boolean; create?: boolean },
  ) => {
    onClose();
    boards.setSelected(board.id);
    if (key) {
      remember(key, { kind: "board", boardId: board.id, boardName: board.name });
      requestComposerFocus(key);
    }
    if (options?.create)
      useColumnNavigation.setState({ creating: { boardId: board.id, at: Date.now() } });
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: {
        view: "columns",
        workspace: "board",
        board: board.id,
        space: undefined,
        unsorted: false,
        ...(key ? { focus: key } : {}),
      },
      state: (previous) => ({
        columnFocusRequest: (previous.columnFocusRequest ?? 0) + 1,
        columnExpand: options?.expand,
      }),
    });
  };

  // A second Cmd+. returns to the board before this one, typing into its last chat.
  const repeat = useBoardsOverview((state) => state.repeat);
  const openedAt = useRef(repeat);
  useEffect(() => {
    if (repeat === openedAt.current) return;
    const recent = useBoardsOverview.getState().recent;
    const previous = boards.boards.find(
      (board) => board.id === recent.find((id) => id !== currentBoard),
    );
    if (!previous) return onClose();
    const focused = getLocalStorageItem(`t3.columns-focus.${previous.id}`, OptionalChatKey);
    open(previous, focused ?? undefined);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Runs once per shortcut press.
  }, [repeat]);
  const previousBoard = boards.boards.find(
    (board) => board.id === useBoardsOverview.getState().recent.find((id) => id !== currentBoard),
  );

  // Undo can fire after the overview closes; it saves through the latest hook instance.
  const latest = useRef(boards);
  useEffect(() => {
    latest.current = boards;
  });
  const removeFromBoard = async (board: ChatBoard, chat: Chat) => {
    const saved = await boards.update({
      ...board,
      hidden: [...new Set([...board.hidden, chat.key])],
    });
    if (!saved) return;
    const toastId = toastManager.add({
      type: "success",
      title: `Removed from ${board.name}`,
      description: chat.title,
      actionProps: {
        children: "Undo",
        onClick: async () => {
          // Rebase on the board as saved right now, so edits made since are kept.
          const saved = appAtomRegistry
            .get(profileSourceAtom)
            .config?.settings.chatBoards?.find((item) => item.id === board.id);
          const restored =
            saved &&
            (await latest.current.save(
              [{ ...saved, hidden: saved.hidden.filter((key) => key !== chat.key) }],
              [saved],
            ));
          toastManager.close(toastId);
          if (!restored)
            toastManager.add({
              type: "error",
              title: `Could not restore the chat to ${board.name}`,
              description: "Add it back with Add existing chat.",
            });
        },
      },
    });
  };

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const moveChat = async (fromId: string, key: string, to: ChatBoard) => {
    const from = boards.boards.find((board) => board.id === fromId);
    if (!from || from.id === to.id) return;
    const { source, target } = moveChatBetweenBoards(from, to, key);
    await boards.save(
      [source, target],
      boards.persisted.filter((board) => board.id === from.id || board.id === to.id),
    );
  };

  const findSlot = (hint: string) => {
    const slot = Object.entries(hints).find(([, letter]) => letter === hint)?.[0];
    for (const tile of tiles) {
      const chat = tile.chats.find((item) => item.slot === slot);
      if (chat) return { board: tile.board, chat };
    }
    return null;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (query !== null) {
      // Enter that confirms an IME conversion belongs to the input.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (!matches?.length || selected === null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : matches.length - 1;
        setSelection((selected + step) % matches.length);
      } else if (event.key === "Enter") {
        const match = matches[selected];
        if (match) {
          event.preventDefault();
          open(match.board, match.chat.key, { expand: event.shiftKey });
        }
      }
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const command = resolveShortcutCommand(event.nativeEvent, keybindings, {
        platform: navigator.platform,
        context: { columnsRail: true },
      });
      const board =
        boards.boards[BOARD_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command)];
      if (board) {
        event.preventDefault();
        open(board);
      }
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      setSelection(null);
      setQuery("");
      return;
    }
    const hint = hintFromEvent(event);
    const target = hint ? findSlot(hint) : null;
    if (!target) return;
    event.preventDefault();
    if (event.altKey) void removeFromBoard(target.board, target.chat);
    else open(target.board, target.chat.key, { expand: event.shiftKey });
  };

  const overviewShortcut = shortcutLabelForCommand(keybindings, "boards.overview");
  const legend: ReadonlyArray<[string, string]> = [
    ["A", "Open"],
    ["⇧A", "Open expanded"],
    ["⌥A", "Remove from board"],
    ["/", "Search"],
    ...(previousBoard && overviewShortcut
      ? [[overviewShortcut, `Back to ${previousBoard.name}`] as [string, string]]
      : []),
    ["Esc", query === null ? "Close" : "Clear search"],
  ];

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next, details) => {
        if (next) return;
        // Escape leaves search first, then the overview.
        if (details.reason === "escape-key" && query !== null) {
          setQuery(null);
          return;
        }
        onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          // Global shortcut listeners stand down while an aria-modal dialog is open.
          aria-modal="true"
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground outline-none transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 [-webkit-app-region:no-drag]"
        >
          <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 px-8 pt-12 pb-5">
            <div className="flex items-baseline gap-3">
              <DialogPrimitive.Title className="text-2xl font-semibold tracking-tight">
                Boards
              </DialogPrimitive.Title>
              <span className="text-sm text-muted-foreground tabular-nums">
                {tiles.length} {tiles.length === 1 ? "board" : "boards"} ·{" "}
                {tiles.reduce((total, tile) => total + tile.chats.length, 0)} chats
              </span>
            </div>
            <DialogPrimitive.Description className="sr-only">
              Press a chat's key to open it with its composer focused.
            </DialogPrimitive.Description>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {legend.map(([key, label]) => (
                <li key={label} className="flex items-center gap-1.5">
                  <Kbd>{key}</Kbd>
                  {label}
                </li>
              ))}
            </ul>
            <DialogPrimitive.Close
              aria-label="Close boards overview"
              className="ml-auto inline-flex size-9 items-center justify-center rounded-md border border-border outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </header>

          {query !== null && (
            <div className="shrink-0 px-8 pb-5">
              <label className="flex h-11 max-w-xl items-center gap-2 rounded-lg border-2 border-foreground bg-background px-3">
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelection(null);
                  }}
                  placeholder="Search chats on every board"
                  aria-label="Search chats on every board"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {matches && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {matches.length} {matches.length === 1 ? "match" : "matches"}
                  </span>
                )}
              </label>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
            {query === null && waiting.length > 0 && (
              <section aria-label="Needs input" className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <AlertCircleIcon className="size-4" aria-hidden />
                  Needs input
                  <span className="rounded-full border border-foreground px-2 text-xs tabular-nums">
                    {waiting.length}
                  </span>
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {waiting.map(({ board, chat }) => (
                    <MiniColumn
                      key={chat.slot}
                      chat={chat}
                      hint={hints[chat.slot]}
                      now={now}
                      selected={false}
                      boardName={board.name}
                      onOpen={() => open(board, chat.key)}
                    />
                  ))}
                </div>
              </section>
            )}

            {matches?.length === 0 && (
              <p className="text-sm text-muted-foreground">No chats match "{query}".</p>
            )}

            <div className="flex flex-wrap items-start gap-5">
              {tiles.map(({ board, chats }, index) => {
                const visible = matches
                  ? chats.filter((chat) => matches.some((match) => match.chat.slot === chat.slot))
                  : chats;
                if (matches && visible.length === 0) return null;
                const command = BOARD_JUMP_KEYBINDING_COMMANDS[index];
                const shortcut = command ? shortcutLabelForCommand(keybindings, command) : null;
                const isCurrent = board.id === currentBoard;
                const needInput = chats.filter((chat) => chat.status === "Needs input").length;
                const running = chats.filter((chat) => chat.status === "Running").length;
                const dropping = dropTarget === board.id;
                return (
                  <section
                    key={board.id}
                    aria-label={board.name}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(board.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                        setDropTarget(null);
                    }}
                    onDrop={(event) => {
                      setDropTarget(null);
                      const raw = event.dataTransfer.getData(DRAG_TYPE);
                      if (!raw) return;
                      event.preventDefault();
                      const { boardId, key } = JSON.parse(raw) as { boardId: string; key: string };
                      void moveChat(boardId, key, board);
                    }}
                    className={cn(
                      "flex min-w-72 max-w-full flex-col gap-3 rounded-2xl bg-muted p-4",
                      dropping
                        ? "border-2 border-dashed border-foreground"
                        : isCurrent
                          ? "border-2 border-foreground"
                          : "border border-border",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => open(board)}
                      className="-m-1 flex items-center gap-2.5 rounded-lg p-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Columns3Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate text-base font-semibold">{board.name}</span>
                      {isCurrent && (
                        <span className="rounded-full border border-foreground px-2 text-2xs font-semibold">
                          Current
                        </span>
                      )}
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {dropping
                          ? "Drop to move here"
                          : [
                              needInput ? `${needInput} need input` : null,
                              running ? `${running} running` : null,
                              !needInput && !running ? `${chats.length} chats` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                      {shortcut && <Kbd>{shortcut}</Kbd>}
                    </button>
                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                      {visible.map((chat) => (
                        <MiniColumn
                          key={chat.slot}
                          chat={chat}
                          hint={hints[chat.slot]}
                          now={now}
                          selected={chat.slot === selectedSlot}
                          onOpen={() => open(board, chat.key)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              DRAG_TYPE,
                              JSON.stringify({ boardId: board.id, key: chat.key }),
                            );
                          }}
                        />
                      ))}
                      {!matches && (
                        <button
                          type="button"
                          disabled={boards.pending || !!boards.unavailable}
                          onClick={() => open(board, undefined, { create: true })}
                          aria-label={`New chat on ${board.name}`}
                          className="flex h-32 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <PlusIcon className="size-5" aria-hidden />
                          New chat
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            {(boards.error || boards.unavailable) && (
              <p role="status" className="mt-6 text-sm text-muted-foreground">
                {boards.error ?? boards.unavailable}
              </p>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
