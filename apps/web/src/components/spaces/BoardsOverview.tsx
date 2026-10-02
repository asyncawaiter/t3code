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
import {
  BOARD_JUMP_KEYBINDING_COMMANDS,
  DEFAULT_CHAT_BOARD,
  type ChatBoard,
} from "@t3tools/contracts";
import { useChatBoards } from "../../hooks/useChatBoards";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useChatColumnMemory } from "../../hooks/useChatColumnLocation";
import { getLocalStorageItem, useLocalStorage } from "../../hooks/useLocalStorage";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadShells } from "../../state/entities";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { requestComposerFocus } from "../../lib/composerFocusRequest";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import { useWorkflowState } from "../../workflowState";
import { cn, randomUUID } from "../../lib/utils";
import { toastManager } from "../ui/toast";
import { Kbd } from "../ui/kbd";
import { useColumnNavigation } from "./columnNavigation";
import { primaryServerKeybindingsAtom, profileSourceAtom } from "../../state/server";
import { scoreChatPickerMatch } from "./chatPickerSearch";
import { useBoardsOverview } from "./BoardsOverviewHost";
import {
  assignHints,
  boardChatKeys,
  boardOverviewTiles,
  chatsNeedingInput,
  moveChatBetweenBoards,
  shiftChatInBoard,
  parseSlot,
  slotId,
  stepCursor,
  storedHints,
  type CursorStep,
} from "./columnState";

const Hints = Schema.Record(Schema.String, Schema.String);
const EMPTY_HINTS: Readonly<Record<string, string>> = {};
const OptionalChatKey = Schema.NullOr(Schema.String);
const DRAG_TYPE = "application/x-t3-board-chat";
/** Arrow keys and their Vim equivalents; Shift+H/J/K/L arrive as uppercase keys. */
const CURSOR_KEYS: Readonly<Record<string, CursorStep>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  h: "left",
  l: "right",
  k: "up",
  j: "down",
  H: "left",
  L: "right",
  K: "up",
  J: "down",
};

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

/** Status as icon plus words, so it never depends on color. */
function StatusLine({ chat, now }: { chat: Chat; now: string }) {
  if (!chat.status) return <span className="text-muted-foreground">Not connected</span>;
  if (chat.status === "Needs input")
    return (
      <span className="flex items-center gap-1 font-semibold text-foreground">
        <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden />
        Needs input
      </span>
    );
  if (chat.status === "Running")
    return (
      <span className="flex items-center gap-1 font-medium text-foreground">
        <PlayIcon className="size-3 shrink-0 fill-current" aria-hidden />
        Running
        {chat.runningSince && (
          <span className="font-normal text-muted-foreground tabular-nums">
            {formatElapsedDurationLabel(chat.runningSince, Date.parse(`${now}Z`))}
          </span>
        )}
      </span>
    );
  if (chat.status === "Ready to review")
    return (
      <span className="flex items-center gap-1 font-medium text-foreground">
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

/** A board column in miniature: the same raised surface and lid as the real columns. */
function MiniColumn(props: {
  chat: Chat;
  hint: string | undefined;
  now: string;
  /** The keyboard cursor or the highlighted search match. */
  selected: boolean;
  boardName?: string;
  onOpen: () => void;
  /** Board copies only: the copy the cursor lives on, draggable to another board. */
  onDragStart?: (event: React.DragEvent) => void;
  onFocus?: () => void;
}) {
  const { chat, hint } = props;
  const needsInput = chat.status === "Needs input";
  // "Profile / Space / Folder / Device": the folder and device say the most at this size.
  const place = chat.context?.split(" / ").slice(-2).join(" · ");
  return (
    <button
      type="button"
      data-overview-slot={props.onDragStart ? chat.slot : undefined}
      draggable={!!props.onDragStart}
      onDragStart={props.onDragStart}
      onFocus={props.onFocus}
      onClick={props.onOpen}
      aria-label={`${chat.title}${chat.status ? `, ${chat.status}` : ""}${hint ? `, key ${hint}` : ""}`}
      aria-current={props.selected || undefined}
      className={cn(
        "relative flex h-40 w-48 shrink-0 flex-col overflow-hidden rounded-xl text-left text-card-foreground outline-none transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        props.selected ? "-translate-y-1 surface-focused" : "surface-raised",
        needsInput && "outline-2 outline-dashed outline-foreground -outline-offset-4",
      )}
    >
      <span className="surface-lid flex items-center gap-2 px-2.5 py-2">
        {hint ? (
          <kbd className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-b-2 border-foreground/70 bg-background font-mono text-sm font-bold uppercase leading-none">
            {hint}
          </kbd>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-2xs">
          <StatusLine chat={chat} now={props.now} />
        </span>
        {props.selected && <Kbd>Enter</Kbd>}
      </span>
      <span className="line-clamp-3 px-3 pt-2.5 text-sm font-semibold leading-snug">
        {chat.title}
      </span>
      <span className="mt-auto truncate px-3 pb-2.5 text-2xs text-muted-foreground">
        {props.boardName ?? place ?? ""}
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
  const draftThreads = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftKeys = useMemo(
    () =>
      new Set(
        Object.values(draftThreads).map((draft) => `${draft.environmentId}:${draft.threadId}`),
      ),
    [draftThreads],
  );
  const tiles = useMemo(
    () => boardOverviewTiles(boards.boards, shells, reviewed, draftKeys),
    [boards.boards, shells, reviewed, draftKeys],
  );
  const waiting = useMemo(() => chatsNeedingInput(tiles), [tiles]);

  const source = useAtomValue(profileSourceAtom);
  const [savedHints, setSavedHints] = useLocalStorage(
    `t3.boards-overview.hints.${source.sourceId}`,
    EMPTY_HINTS,
    Hints,
  );
  const slots = useMemo(
    () => tiles.flatMap((tile) => tile.chats.map((chat) => chat.slot)),
    [tiles],
  );
  const hints = useMemo(() => assignHints(savedHints, slots), [savedHints, slots]);
  useEffect(() => {
    // Until the source's boards load, the list is a placeholder; saving it would wipe every letter.
    if (!source.config?.settings.chatBoards) return;
    const next = storedHints(savedHints, hints);
    if (JSON.stringify(next) !== JSON.stringify(savedHints)) setSavedHints(next);
  }, [hints, savedHints, setSavedHints, source.config?.settings.chatBoards]);

  const [query, setQuery] = useState<string | null>(null);
  /** The highlighted match by slot, so it stays put when titles or boards change. */
  const [selection, setSelection] = useState<string | null>(null);
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
  const chosen = matches?.findIndex((match) => match.chat.slot === selection) ?? -1;
  const selected = matches?.length ? (chosen >= 0 ? chosen : (best ?? 0)) : null;
  const selectedSlot = selected === null ? null : (matches?.[selected]?.chat.slot ?? null);
  useEffect(() => {
    if (!selectedSlot) return;
    document
      .querySelector(`[data-overview-slot="${CSS.escape(selectedSlot)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedSlot]);

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
  const previousBoardOf = () =>
    useBoardsOverview
      .getState()
      .recent.flatMap((id) =>
        id === currentBoard ? [] : boards.boards.filter((board) => board.id === id),
      )[0];
  const repeat = useBoardsOverview((state) => state.repeat);
  // The host restarts `repeat` at 0 on open, so a press made while this chunk loaded still counts.
  const openedAt = useRef(0);
  useEffect(() => {
    if (repeat === openedAt.current) return;
    const previous = previousBoardOf();
    if (!previous) return onClose();
    const focused = getLocalStorageItem(`t3.columns-focus.${previous.id}`, OptionalChatKey);
    open(previous, focused ?? undefined);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Runs once per shortcut press.
  }, [repeat]);
  const previousBoard = previousBoardOf();

  // Edits and their undo can run after the overview closes; they save through the latest hook.
  const latest = useRef(boards);
  useEffect(() => {
    latest.current = boards;
  });
  const queue = useRef<Promise<readonly ChatBoard[] | null>>(Promise.resolve(null));
  const queued = useRef(0);
  /**
   * Saves board edits one after another, each built on the boards the previous one saved, so
   * quick repeated keys chain instead of failing. `build` returns the edited boards, or null
   * when there is nothing to do. Resolves to the saved boards, or null.
   */
  const change = (build: (persisted: readonly ChatBoard[]) => ChatBoard[] | null) => {
    queued.current += 1;
    const run = queue.current.then(async (last) => {
      const persisted = last ?? latest.current.persisted;
      const edited = build(persisted);
      const saved = edited?.length
        ? await latest.current.save(
            edited,
            persisted.filter((board) => edited.some((item) => item.id === board.id)),
          )
        : false;
      if (edited?.length && !saved)
        toastManager.add({
          type: "error",
          title: "Board change not saved",
          description: latest.current.lastError.current ?? undefined,
        });
      return { persisted: saved || last, saved: saved || null, before: persisted };
    });
    queue.current = run.then((result) => (--queued.current === 0 ? null : result.persisted));
    return run;
  };
  const boardIn = (persisted: readonly ChatBoard[], id: string) =>
    persisted.find((board) => board.id === id) ??
    (id === DEFAULT_CHAT_BOARD.id ? DEFAULT_CHAT_BOARD : undefined);

  /** The latest edit's way back, for Cmd+Z and the removal toast. */
  const undoLast = useRef<(() => void) | null>(null);
  /** Records how to put `ids` back as they were, unless they changed again since. */
  const rememberUndo = (
    ids: readonly string[],
    before: readonly ChatBoard[],
    after: readonly ChatBoard[],
    title: string,
  ) => {
    let used = false;
    const undo = () => {
      if (used) return;
      used = true;
      if (undoLast.current === undo) undoLast.current = null;
      let changed = false;
      void change((persisted) => {
        const unchanged = ids.every(
          (id) =>
            JSON.stringify(persisted.find((board) => board.id === id) ?? null) ===
            JSON.stringify(after.find((board) => board.id === id) ?? null),
        );
        changed = !unchanged;
        return unchanged ? ids.flatMap((id) => boardIn(before, id) ?? []) : null;
      }).then(() => {
        // A failed save already reported itself; this covers boards edited since.
        if (changed)
          toastManager.add({
            type: "error",
            title: `Could not undo: ${title}`,
            description: "The board changed since. Make the change again by hand.",
          });
      });
    };
    undoLast.current = undo;
    return undo;
  };

  const removeFromBoard = async (boardId: string, chat: Chat) => {
    const { saved, before } = await change((persisted) => {
      const board = boardIn(persisted, boardId);
      return board && !board.hidden.includes(chat.key)
        ? [{ ...board, hidden: [...board.hidden, chat.key] }]
        : null;
    });
    if (!saved) return;
    const name = boardIn(saved, boardId)?.name ?? "board";
    const undo = rememberUndo([boardId], before, saved, `remove from ${name}`);
    const toastId = toastManager.add({
      type: "success",
      title: `Removed from ${name}`,
      description: chat.title,
      actionProps: {
        children: "Undo",
        onClick: () => {
          toastManager.close(toastId);
          undo();
        },
      },
    });
  };

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const moveChat = async (fromId: string, key: string, toId: string) => {
    if (fromId === toId) return null;
    const { saved, before } = await change((persisted) => {
      const from = boardIn(persisted, fromId);
      const to = boardIn(persisted, toId);
      if (!from?.order.includes(key) || !to) return null;
      const { source, target } = moveChatBetweenBoards(from, to, key);
      return [source, target];
    });
    if (saved) rememberUndo([fromId, toId], before, saved, "move chat");
    return saved;
  };

  // The keyboard cursor: arrows or H/J/K/L move it, Shift moves the chat under it. The card
  // under it holds DOM focus, so Tab, screen readers and Enter all agree on what is selected.
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorTarget = (() => {
    for (const tile of tiles) {
      const chat = tile.chats.find((item) => item.slot === cursor);
      if (chat) return { tile, chat };
    }
    return null;
  })();
  const focusedCursor = useRef<string | null>(null);
  useEffect(() => {
    if (!cursor || focusedCursor.current === cursor) return;
    // A chat that just moved boards renders once the settings push arrives; try again then.
    const card = document.querySelector<HTMLElement>(
      `[data-overview-slot="${CSS.escape(cursor)}"]`,
    );
    if (!card) return;
    focusedCursor.current = cursor;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Re-checks when tiles change.
  }, [cursor, tiles]);
  // Moves read the cursor's slot rather than the rendered tiles, and each edit recomputes
  // positions from the boards the previous edit saved, so quick presses chain correctly.
  const moveCursorChat = async (step: CursorStep) => {
    if (!cursor) return;
    const { boardId, key } = parseSlot(cursor);
    if (step === "left" || step === "right") {
      const { saved, before } = await change((persisted) => {
        const board = boardIn(persisted, boardId);
        const next = board && shiftChatInBoard(board, boardChatKeys(board, shells), key, step);
        return next ? [next] : null;
      });
      if (saved) rememberUndo([boardId], before, saved, "reorder");
      return;
    }
    const index = boards.boards.findIndex((board) => board.id === boardId);
    const to = boards.boards[index + (step === "down" ? 1 : -1)];
    if (index < 0 || !to) return;
    const moved = slotId(to.id, key);
    // The cursor goes ahead of the save so the next press starts from the new board.
    setCursor(moved);
    if (!(await moveChat(boardId, key, to.id)))
      setCursor((current) => (current === moved ? cursor : current));
  };
  const removeCursorChat = () => {
    if (!cursorTarget) return;
    const { tile, chat } = cursorTarget;
    const index = tile.chats.indexOf(chat);
    const neighbour = tile.chats[index + 1] ?? tile.chats[index - 1];
    setCursor(neighbour?.slot ?? null);
    void removeFromBoard(tile.board.id, chat);
  };

  // A board named in place, so it can be filled by dragging or Shift+arrows without leaving.
  const [newBoard, setNewBoard] = useState<string | null>(null);
  const createBoard = async () => {
    const name = newBoard?.trim();
    if (!name) return;
    const board = { ...DEFAULT_CHAT_BOARD, id: randomUUID(), name };
    if (!(await change(() => [board])).saved) return;
    setNewBoard(null);
    setCreated(board.id);
  };
  // The new board arrives with the next settings push, so scroll once it renders.
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    if (!created || !tiles.some((tile) => tile.board.id === created)) return;
    document
      .querySelector(`[data-overview-board="${CSS.escape(created)}"]`)
      ?.scrollIntoView({ block: "nearest" });
    setCreated(null);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Waits for the new board to arrive in tiles.
  }, [created, tiles]);

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
        setSelection(matches[(selected + step) % matches.length]!.chat.slot);
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
      if (event.key.toLowerCase() === "z" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        // Undo after edits still saving, so it reverses the latest one rather than refusing it.
        void queue.current.then(() => undoLast.current?.());
        return;
      }
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
    // Enter and Delete act on the selected card, never on another focused control.
    const onCursor =
      cursorTarget !== null &&
      (event.target === event.currentTarget ||
        (event.target as HTMLElement).dataset.overviewSlot === cursor);
    const editing = event.shiftKey || event.key === "Backspace" || event.key === "Delete";
    // Held keys would queue a burst of saves; one press, one edit.
    if (event.repeat && editing) {
      event.preventDefault();
      return;
    }
    const step = CURSOR_KEYS[event.key];
    if (step && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) void moveCursorChat(step);
      else setCursor(stepCursor(tiles, cursor, step, currentBoard));
      return;
    }
    if (onCursor && event.key === "Enter") {
      event.preventDefault();
      open(cursorTarget.tile.board, cursorTarget.chat.key, { expand: event.shiftKey });
      return;
    }
    if (onCursor && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      removeCursorChat();
      return;
    }
    if ((event.key === "+" || event.key === "=") && !event.altKey) {
      event.preventDefault();
      if (!boards.unavailable) setNewBoard((name) => name ?? "");
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
    // Option+letter belongs to other apps' global shortcuts; removal is select, then Delete.
    if (!target || event.altKey) return;
    event.preventDefault();
    open(target.board, target.chat.key, { expand: event.shiftKey });
  };

  const overviewShortcut = shortcutLabelForCommand(keybindings, "boards.overview");
  const legend: ReadonlyArray<[string, string]> = [
    ["A", "Open"],
    ["⇧A", "Open expanded"],
    ["←↑↓→ or HJKL", "Select"],
    ["⇧ + move", "Move chat"],
    ["⌫", "Remove selected"],
    ["⌘Z", "Undo"],
    ["/", "Search"],
    ["+", "New board"],
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

          <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-1 pb-10">
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
                      selected={chat.slot === cursor}
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
                    data-overview-board={board.id}
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
                      void moveChat(boardId, key, board.id);
                    }}
                    className={cn(
                      "flex min-w-72 max-w-full flex-col overflow-hidden rounded-2xl surface-raised",
                      isCurrent && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      dropping && "outline-2 outline-dashed outline-foreground outline-offset-4",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => open(board)}
                      className="surface-lid flex items-center gap-2.5 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
                    <div className="surface-canvas flex gap-3 overflow-x-auto p-4">
                      {visible.map((chat) => (
                        <MiniColumn
                          key={chat.slot}
                          chat={chat}
                          hint={hints[chat.slot]}
                          now={now}
                          selected={chat.slot === (matches ? selectedSlot : cursor)}
                          onOpen={() => open(board, chat.key)}
                          onFocus={() => setCursor(chat.slot)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              DRAG_TYPE,
                              JSON.stringify({ boardId: board.id, key: chat.key }),
                            );
                          }}
                        />
                      ))}
                      {!matches && chats.length === 0 && (
                        <p className="flex h-40 w-44 shrink-0 items-center text-xs leading-relaxed text-muted-foreground">
                          Drag chats here, or select one on the board above and press ⇧↓.
                        </p>
                      )}
                      {!matches && (
                        <button
                          type="button"
                          disabled={!!boards.unavailable}
                          onClick={() => open(board, undefined, { create: true })}
                          aria-label={`New chat on ${board.name}`}
                          className="flex h-40 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <PlusIcon className="size-5" aria-hidden />
                          New chat
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
              {!matches && (
                <section
                  aria-label="New board"
                  className="flex min-h-60 w-72 flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border focus-within:border-foreground"
                >
                  {newBoard === null ? (
                    <button
                      type="button"
                      disabled={!!boards.unavailable}
                      onClick={() => setNewBoard("")}
                      className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground disabled:opacity-50"
                    >
                      <PlusIcon className="size-6" aria-hidden />
                      New board
                      <Kbd>+</Kbd>
                    </button>
                  ) : (
                    <form
                      className="flex flex-1 flex-col"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createBoard();
                      }}
                    >
                      <div className="surface-lid flex items-center gap-2.5 px-4 py-3">
                        <Columns3Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <input
                          autoFocus
                          value={newBoard}
                          maxLength={100}
                          onChange={(event) => setNewBoard(event.target.value)}
                          onKeyDown={(event) => {
                            // Typing here must not open chats by their letters.
                            event.stopPropagation();
                            if (event.key === "Escape") setNewBoard(null);
                          }}
                          placeholder="Board name"
                          aria-label="New board name"
                          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="flex flex-1 flex-col justify-end gap-2 p-4 text-xs text-muted-foreground">
                        <p>
                          Fill it by dragging chats in, or select a chat and press ⇧↓ until it lands
                          here.
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Kbd>Enter</Kbd> Create <Kbd>Esc</Kbd> Cancel
                        </p>
                      </div>
                    </form>
                  )}
                </section>
              )}
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
