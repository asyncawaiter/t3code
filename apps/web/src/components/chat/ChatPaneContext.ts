import { createContext, type ReactNode } from "react";

// Only the selected pane owns global composer shortcuts and focus requests.
export const ChatPaneContext = createContext<{
  active: boolean;
  column: boolean;
  columnActions?: ReactNode;
}>({ active: true, column: false });
