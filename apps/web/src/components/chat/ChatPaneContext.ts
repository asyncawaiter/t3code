import { createContext } from "react";

// Only the selected pane owns global composer shortcuts and focus requests.
export const ChatPaneContext = createContext({ active: true, column: false });
