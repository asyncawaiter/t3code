import * as Schema from "effect/Schema";
import { create } from "zustand";

import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

/**
 * Where a chat's right panel lives in columns mode: one side panel for the board
 * that follows the focused column, or inside each column next to its chat.
 */
export type ColumnsPanelPlacement = "side" | "column";

const ColumnsPanelPlacementSchema = Schema.Literals(["side", "column"]);

export function useColumnsPanelPlacement() {
  return useLocalStorage<ColumnsPanelPlacement, ColumnsPanelPlacement>(
    "t3code:columns-panel-placement",
    "side",
    ColumnsPanelPlacementSchema,
  );
}

const SIDE_PANEL_WIDTH_KEY = "t3code:columns-side-panel-width";
export const SIDE_PANEL_MIN_WIDTH = 320;
const SIDE_PANEL_DEFAULT_WIDTH = 448;

export const clampSidePanelWidth = (width: number) =>
  Math.max(
    SIDE_PANEL_MIN_WIDTH,
    Math.min(Math.floor(window.innerWidth * 0.8), Number.isFinite(width) ? width : 0),
  );

function readSidePanelWidth(): number {
  try {
    return getLocalStorageItem(SIDE_PANEL_WIDTH_KEY, Schema.Finite) ?? SIDE_PANEL_DEFAULT_WIDTH;
  } catch {
    return SIDE_PANEL_DEFAULT_WIDTH;
  }
}

interface ColumnsSidePanelState {
  /**
   * Whether the side panel is open for the board; focusing another column keeps
   * it. Null until a focused column reports in, so a reload adopts what was open.
   */
  readonly open: boolean | null;
  /** One width for the board: each column mounts its own panel, and all share it. */
  readonly width: number;
  /** The column whose panel is on screen, so the board can keep clear of it. */
  readonly shownBy: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly setWidth: (width: number) => void;
  readonly persistWidth: () => void;
  readonly show: (owner: string) => void;
  readonly hide: (owner: string) => void;
}

export const useColumnsSidePanel = create<ColumnsSidePanelState>()((set, get) => ({
  open: null,
  width: readSidePanelWidth(),
  shownBy: null,
  setOpen: (open) => set((state) => (state.open === open ? state : { open })),
  setWidth: (width) => set({ width }),
  persistWidth: () => {
    try {
      setLocalStorageItem(SIDE_PANEL_WIDTH_KEY, get().width, Schema.Finite);
    } catch (error) {
      console.error("Could not persist side panel width.", error);
    }
  },
  show: (owner) => set((state) => (state.shownBy === owner ? state : { shownBy: owner })),
  // Only the owner clears it: when focus moves, the next column may have shown already.
  hide: (owner) => set((state) => (state.shownBy === owner ? { shownBy: null } : state)),
}));

/** Board space the side panel covers, zero while it is closed. */
export function useSidePanelInset(): number {
  return useColumnsSidePanel((state) =>
    state.shownBy === null ? 0 : clampSidePanelWidth(state.width),
  );
}
