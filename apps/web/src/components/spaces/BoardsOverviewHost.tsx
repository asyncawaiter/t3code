import { lazy, Suspense, useEffect } from "react";
import { create } from "zustand";
import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand } from "../../keybindings";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isTerminalFocused } from "../../lib/terminalFocus";

export const useBoardsOverview = create<{ open: boolean }>(() => ({ open: false }));
const close = () => useBoardsOverview.setState({ open: false });

const BoardsOverview = lazy(() => import("./BoardsOverview"));

/** Owns the overview shortcut everywhere in the app; the overview loads on first open. */
export function BoardsOverviewHost() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const open = useBoardsOverview((state) => state.open);
  useEffect(() => {
    // Capture phase so it also toggles from the composer and from inside the overview.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { terminalFocus: isTerminalFocused() },
      });
      if (command !== "boards.overview") return;
      event.preventDefault();
      event.stopPropagation();
      useBoardsOverview.setState((state) => ({ open: !state.open }));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings]);
  return open ? (
    <Suspense fallback={null}>
      <BoardsOverview onClose={close} />
    </Suspense>
  ) : null;
}
