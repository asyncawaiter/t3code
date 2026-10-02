import { lazy, Suspense, useEffect } from "react";
import { create } from "zustand";
import { useLocation } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand } from "../../keybindings";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isTerminalFocused } from "../../lib/terminalFocus";
import * as Schema from "effect/Schema";
import { profileSourceAtom } from "../../state/server";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { columnSpaceScope, isColumnsLocation, useColumnNavigation } from "./columnNavigation";

/**
 * `recent` lists boards most recently shown first, for this session only; the overview's
 * second Cmd+. returns to the board before the current one.
 */
export const useBoardsOverview = create<{
  open: boolean;
  /** Bumped when the shortcut fires while open, so the overview can switch boards. */
  repeat: number;
  recent: readonly string[];
}>(() => ({ open: false, repeat: 0, recent: [] }));
const close = () => useBoardsOverview.setState({ open: false });

const BoardsOverview = lazy(() => import("./BoardsOverview"));

/** The board on screen, or null when the main view is not a custom board. */
export function currentBoardId(pathname: string, search: string, selected: string) {
  return isColumnsLocation(pathname, search) && !columnSpaceScope(pathname, search)
    ? (new URLSearchParams(search).get("board") ?? selected)
    : null;
}

/** Owns the overview shortcut everywhere in the app; the overview loads on first open. */
export function BoardsOverviewHost() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const open = useBoardsOverview((state) => state.open);
  const location = useLocation();
  const source = useAtomValue(profileSourceAtom);
  // Read directly rather than through useChatBoards, which also rewrites the boards cache.
  const [selected] = useLocalStorage(
    `t3.columns-selected.${source.sourceId}`,
    "default",
    Schema.String,
  );
  const board = currentBoardId(location.pathname, location.searchStr, selected);
  useEffect(() => {
    if (!board) return;
    useBoardsOverview.setState((state) =>
      state.recent[0] === board
        ? state
        : { recent: [board, ...state.recent.filter((id) => id !== board)].slice(0, 10) },
    );
  }, [board]);
  useEffect(() => {
    // Capture phase so it also works from the composer and from inside the overview.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { terminalFocus: isTerminalFocused() },
      });
      if (command !== "boards.overview") return;
      const { open } = useBoardsOverview.getState();
      // Another dialog or picker owns the keyboard; opening on top would strand it.
      if (
        !open &&
        (useColumnNavigation.getState().choosing ||
          document.querySelector(
            // The docked side panel is a dialog that stays open; it does not own the keyboard.
            '[role="dialog"][data-open]:not([data-slot="sheet-popup"]), [role="alertdialog"][data-open], [role="dialog"][aria-modal="true"]',
          ))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      // `repeat` restarts at 0 so a press made before the overview's code loads still counts.
      useBoardsOverview.setState((state) =>
        state.open ? { repeat: state.repeat + 1 } : { open: true, repeat: 0 },
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings]);
  return open ? (
    <Suspense fallback={null}>
      <BoardsOverview onClose={close} currentBoard={board} />
    </Suspense>
  ) : null;
}
