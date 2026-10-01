import { useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { AlertCircleIcon, Columns3Icon, PlayIcon } from "lucide-react";
import { BOARD_JUMP_KEYBINDING_COMMANDS, type ChatBoard } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useChatBoards } from "../../hooks/useChatBoards";
import { useChatColumnMemory } from "../../hooks/useChatColumnLocation";
import { useThreadShells } from "../../state/entities";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { requestComposerFocus } from "../../lib/composerFocusRequest";
import { useWorkflowState } from "../../workflowState";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Kbd } from "../ui/kbd";
import { boardColumnKeys, columnStatus } from "./ChatColumns";
import { columnSpaceScope, isColumnsLocation } from "./columnNavigation";

/** Home row first, so the most common jumps need the least reach. */
const HINTS = "asdfjklghqweruioptyzxcvbnm1234567890";

/** Each board's visible columns in board order, with one-key hints numbered across all boards. */
export function boardOverviewTiles(
  boards: readonly ChatBoard[],
  shells: readonly EnvironmentThreadShell[],
  reviewed: Readonly<Record<string, string>>,
) {
  const byKey = new Map(shells.map((shell) => [`${shell.environmentId}:${shell.id}`, shell]));
  let next = 0;
  return boards.map((board) => {
    const members = board.order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
    return {
      board,
      chats: boardColumnKeys(members, board).map((key) => {
        const chat = byKey.get(key);
        return {
          key,
          title: chat?.title ?? board.labels?.[key]?.title ?? "Unavailable chat",
          // Drafts and chats on offline devices have no live state to report.
          status: chat ? columnStatus(chat, reviewed[key]) : null,
          hint: HINTS[next++] ?? null,
        };
      }),
    };
  });
}

function Status({ status }: { status: string | null }) {
  if (!status || status === "Idle") return null;
  if (status === "Needs input")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded border border-current px-1.5 text-xs font-semibold text-warning-foreground">
        <AlertCircleIcon className="size-3.5" aria-hidden />
        Needs input
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      {status === "Running" && <PlayIcon className="size-3" aria-hidden />}
      {status}
    </span>
  );
}

/** Mission Control for custom boards: every board at a glance, one key to land in any chat. */
export default function BoardsOverview({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { boards, selected, setSelected } = useChatBoards();
  const shells = useThreadShells();
  const reviewed = useWorkflowState((state) => state.reviewed);
  const { remember } = useChatColumnMemory();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const tiles = useMemo(
    () => boardOverviewTiles(boards, shells, reviewed),
    [boards, shells, reviewed],
  );
  const current =
    isColumnsLocation(location.pathname, location.searchStr) &&
    !columnSpaceScope(location.pathname, location.searchStr)
      ? (new URLSearchParams(location.searchStr).get("board") ?? selected)
      : null;

  const open = (board: ChatBoard, key?: string) => {
    onClose();
    setSelected(board.id);
    if (key) {
      remember(key, { kind: "board", boardId: board.id, boardName: board.name });
      requestComposerFocus(key);
    }
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
      state: (previous) => ({ columnFocusRequest: (previous.columnFocusRequest ?? 0) + 1 }),
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey) {
      const command = resolveShortcutCommand(event.nativeEvent, keybindings, {
        platform: navigator.platform,
        context: { columnsRail: true },
      });
      const board = boards[BOARD_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command)];
      if (board) {
        event.preventDefault();
        open(board);
      }
      return;
    }
    if (event.altKey || event.key.length !== 1) return;
    const hint = event.key.toLowerCase();
    for (const tile of tiles) {
      const chat = tile.chats.find((item) => item.hint === hint);
      if (chat) {
        event.preventDefault();
        open(tile.board, chat.key);
        return;
      }
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPopup className="w-full max-w-6xl" bottomStickOnMobile={false} onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle>Boards</DialogTitle>
          <DialogDescription>
            Press a chat's key to open it, ready to type. Esc returns to where you were.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
            {tiles.map(({ board, chats }, index) => {
              const command = BOARD_JUMP_KEYBINDING_COMMANDS[index];
              const shortcut = command ? shortcutLabelForCommand(keybindings, command) : null;
              const isCurrent = board.id === current;
              return (
                <section
                  key={board.id}
                  aria-label={board.name}
                  className={cn(
                    "flex min-w-0 flex-col gap-2 rounded-xl p-3",
                    isCurrent ? "border-2 border-foreground" : "border border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => open(board)}
                    className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Columns3Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold">{board.name}</span>
                    {isCurrent && <span className="text-xs font-semibold">Current</span>}
                    {shortcut && <Kbd>{shortcut}</Kbd>}
                  </button>
                  {chats.length === 0 ? (
                    <p className="px-1 text-sm text-muted-foreground">No chats</p>
                  ) : (
                    <ol className="flex flex-col gap-1.5">
                      {chats.map((chat) => (
                        <li key={chat.key}>
                          <button
                            type="button"
                            onClick={() => open(board, chat.key)}
                            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {chat.hint ? (
                              <kbd className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-foreground font-mono text-sm font-bold uppercase">
                                {chat.hint}
                              </kbd>
                            ) : (
                              <span className="size-6 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                            <Status status={chat.status} />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
