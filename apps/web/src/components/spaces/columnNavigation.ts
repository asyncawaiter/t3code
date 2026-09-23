import type { ChatBoard } from "@t3tools/contracts";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { workspaceView } from "./workspaceView";

export function isColumnsLocation(pathname: string, search: string) {
  return (
    pathname.startsWith("/spaces/") &&
    workspaceView(new URLSearchParams(search).get("view")) === "columns"
  );
}

/** Selection in the picker is separate from navigation through profiles and spaces. */
export const useColumnNavigation = create<{ choosing: boolean }>(() => ({ choosing: false }));

/** Location can advance before route matches; never remember that transitional URL. */
export function chatLocationToRemember(
  pathname: string,
  href: string,
  matchedThreadPath: string | null,
) {
  return matchedThreadPath === pathname ? href : null;
}

export const ChatReturnLocation = Schema.Struct({
  href: Schema.String,
  profileId: Schema.NullOr(Schema.String),
  space: Schema.NullOr(Schema.String),
});
export const DEFAULT_CHAT_RETURN: typeof ChatReturnLocation.Type = {
  href: "/dashboard",
  profileId: null,
  space: null,
};

export function isDashboardLocation(pathname: string, search: string) {
  return (
    pathname === "/dashboard" ||
    (pathname.startsWith("/spaces/") && !workspaceView(new URLSearchParams(search).get("view")))
  );
}

const ChatMode = Schema.Literals(["chat", "columns"]);
export function useChatMode() {
  return useLocalStorage("t3.workspace.chat-mode", "chat", ChatMode);
}

export function usesColumnsRail(pathname: string, search: string, mode: "chat" | "columns") {
  return (
    isColumnsLocation(pathname, search) ||
    (mode === "columns" &&
      (pathname === "/dashboard" ||
        pathname.startsWith("/spaces/") ||
        pathname === "/usage" ||
        pathname === "/pull-requests"))
  );
}

/** Explicitly opening a reference never changes the chat's settled or archived state. */
export function boardWithOpenedChat(
  board: ChatBoard,
  chat: {
    key: string;
    title: string;
    context: string;
    reference: boolean;
    previousKey?: string;
  },
): ChatBoard {
  if (chat.previousKey && chat.previousKey !== chat.key && board.order.includes(chat.previousKey)) {
    const previous = chat.previousKey;
    const replace = (keys: readonly string[]) => [
      ...new Set(keys.map((key) => (key === previous ? chat.key : key))),
    ];
    const widths = { ...board.widths };
    if (widths[previous] !== undefined && widths[chat.key] === undefined)
      widths[chat.key] = widths[previous];
    delete widths[previous];
    const labels = { ...board.labels, [chat.key]: { title: chat.title, context: chat.context } };
    delete labels[previous];
    board = {
      ...board,
      order: replace(board.order),
      hidden: replace(board.hidden),
      kept: replace(board.kept),
      widths,
      labels,
    };
  }
  if (
    board.order.includes(chat.key) &&
    !board.hidden.includes(chat.key) &&
    (!chat.reference || board.kept.includes(chat.key))
  )
    return board;
  return {
    ...board,
    order: [...new Set([...board.order, chat.key])],
    hidden: board.hidden.filter((key) => key !== chat.key),
    kept: chat.reference ? [...new Set([...board.kept, chat.key])] : board.kept,
    labels: { ...board.labels, [chat.key]: { title: chat.title, context: chat.context } },
  };
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    dashboardReturn?: { href: string; label: string; threadKey: string } | undefined;
    dashboardFocusKey?: string | undefined;
  }
}
