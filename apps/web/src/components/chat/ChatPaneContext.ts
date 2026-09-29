import { createContext, type ReactNode } from "react";

// Only the selected pane owns global composer shortcuts and focus requests.
export const ChatPaneContext = createContext<{
  active: boolean;
  column: boolean;
  /** A board column's chat width, and the way to change it (the docked panel's divider). */
  columnWidth?: number;
  resizeColumn?: (width: number) => void;
}>({ active: true, column: false });

// Kept apart from the pane so a column's freshly built menu re-renders only the
// header that shows it, not the whole memoized chat.
export const ChatColumnActionsContext = createContext<ReactNode>(null);
