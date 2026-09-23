import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { readThreadShell } from "../state/entities";
import { useChatBoards } from "./useChatBoards";
import { boardWithOpenedChat, useChatMode } from "../components/spaces/columnNavigation";

/** Reuse the selected board for every chat entry point without changing its layout. */
export function useOpenChatInColumns() {
  const [mode] = useChatMode();
  const boards = useChatBoards();
  const navigate = useNavigate();
  const router = useRouter();
  const dashboardReturn = useLocation({ select: (location) => location.state.dashboardReturn });
  return async (chat: {
    environmentId: EnvironmentId;
    id: ThreadId;
    title?: string;
    previousKey?: string;
    archivedAt?: string | null;
    settledOverride?: string | null;
  }) => {
    if (mode !== "columns") return false;
    const origin = router.state.location.href;
    const shell = readThreadShell({ environmentId: chat.environmentId, threadId: chat.id });
    const key = `${chat.environmentId}:${chat.id}`;
    const next = boardWithOpenedChat(boards.board, {
      key,
      ...(chat.previousKey ? { previousKey: chat.previousKey } : {}),
      title: chat.title ?? shell?.title ?? "Chat",
      context: boards.board.labels?.[key]?.context ?? "",
      reference:
        !!(chat.archivedAt ?? shell?.archivedAt) ||
        (chat.settledOverride ?? shell?.settledOverride) === "settled",
    });
    if (next !== boards.board && !(await boards.update(next)))
      throw new Error(
        boards.unavailable ??
          "Could not save this chat to the board. Your chat is safe. Try again.",
      );
    if (router.state.location.href !== origin) return true;
    await navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: { view: "columns", space: undefined, unsorted: false, focus: key },
      state: { dashboardReturn },
    });
    return true;
  };
}
