import { createContext, type ReactNode } from "react";

// Only the selected pane owns global composer shortcuts and focus requests.
export const ChatPaneContext = createContext<{
  active: boolean;
  column: boolean;
  columnActions?: ReactNode;
  /** A board column's chat width, and the way to change it (the docked panel's divider). */
  columnWidth?: number;
  resizeColumn?: (width: number) => void;
}>({ active: true, column: false });
