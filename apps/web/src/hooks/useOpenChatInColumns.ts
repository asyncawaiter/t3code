import {
  useChatColumnLocation,
  useChatColumnMemory,
  type ColumnLocation,
} from "./useChatColumnLocation";
import { toastManager } from "../components/ui/toast";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { indexProfileSpaces, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { profileThreadFilter } from "@t3tools/client-runtime/state/profiles";
import { usePrimarySettings } from "./useSettings";
import { OUTSIDE_SPACES } from "../components/sidebar/Spaces.logic";
import { readThreadShell } from "../state/entities";
import { useChatBoards } from "./useChatBoards";
import {
  boardWithOpenedChat,
  useChatMode,
  columnSpaceScope,
  spaceColumnsNavigation,
} from "../components/spaces/columnNavigation";

/** Space entry points preserve scope; explicit boards retain their saved membership. */
export function useOpenChatInColumns(intent: "locate" | "create" = "locate") {
  const resolveLocation = useChatColumnLocation();
  const { remember } = useChatColumnMemory();
  const [mode] = useChatMode();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const boards = useChatBoards();
  const navigate = useNavigate();
  const router = useRouter();
  const dashboardReturn = useLocation({ select: (location) => location.state.dashboardReturn });
  return async (
    chat: {
      environmentId: EnvironmentId;
      id: ThreadId;
      title?: string;
      projectId?: import("@t3tools/contracts").ProjectId | undefined;
      previousKey?: string;
      hash?: string;
      archivedAt?: string | null;
      settledOverride?: string | null;
    },
    options?: {
      intent?: "locate" | "create";
      destination?: ColumnLocation;
      dashboardReturn?: typeof dashboardReturn;
    },
  ) => {
    if (mode !== "columns") return false;
    const returnTo = options?.dashboardReturn ?? dashboardReturn;
    if ((options?.intent ?? intent) === "locate") {
      const destination = resolveLocation(
        { environmentId: chat.environmentId, threadId: chat.id, projectId: chat.projectId },
        options?.destination,
      );
      if (destination.blocked) {
        toastManager.add({
          type: "info",
          title: "Board unavailable",
          description: destination.blocked,
          actionProps: {
            children: "Connections",
            onClick: () => void navigate({ to: "/settings/connections" }),
          },
        });
        return true;
      }
      await navigate({
        ...destination.navigation,
        state: (previous) => ({
          dashboardReturn: returnTo,
          columnFocusRequest: (previous.columnFocusRequest ?? 0) + 1,
        }),
        ...(chat.hash ? { hash: chat.hash } : {}),
      });
      if (options?.destination) remember(`${chat.environmentId}:${chat.id}`, destination.location);
      if (destination.fallback)
        toastManager.add({
          type: "info",
          title: `Opened in ${destination.label}`,
          description: destination.fallback,
          timeout: 6000,
        });
      return true;
    }
    const origin = router.state.location.href;
    const current = new URL(origin, "http://local");
    const shell = readThreadShell({ environmentId: chat.environmentId, threadId: chat.id });
    let spaceScope =
      columnSpaceScope(current.pathname, current.search) ??
      (current.pathname === "/dashboard"
        ? { profileId: "all", spaceId: undefined, unsorted: false }
        : undefined);
    if (
      spaceScope &&
      shell &&
      !profileThreadFilter(
        profiles,
        spaceScope.profileId,
        spaceScope.unsorted ? OUTSIDE_SPACES : (spaceScope.spaceId ?? null),
      )({ ...shell, environmentId: chat.environmentId, id: chat.id, pinnedAt: null })
    ) {
      const placement = indexProfileSpaces(profiles).get(`${chat.environmentId}:${chat.id}`);
      const owner =
        placement?.profile ??
        profiles.find((profile) =>
          profile.projectKeys.includes(`${chat.environmentId}:${shell.projectId}`),
        );
      spaceScope = {
        profileId: owner?.id ?? "all",
        spaceId: placement?.space.id,
        unsorted: !placement,
      };
    }
    if (spaceScope) {
      remember(
        `${chat.environmentId}:${chat.id}`,
        { kind: "space", ...spaceScope },
        chat.previousKey,
      );
      await navigate({
        ...spaceColumnsNavigation(spaceScope, `${chat.environmentId}:${chat.id}`),
        state: { dashboardReturn },
        ...(chat.hash ? { hash: chat.hash } : {}),
      });
      return true;
    }
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
    remember(
      key,
      { kind: "board", boardId: boards.board.id, boardName: boards.board.name },
      chat.previousKey,
    );
    if (router.state.location.href !== origin) return true;
    await navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: {
        view: "columns",
        workspace: "board",
        board: boards.board.id,
        space: undefined,
        unsorted: false,
        focus: key,
      },
      state: { dashboardReturn },
      ...(chat.hash ? { hash: chat.hash } : {}),
    });
    return true;
  };
}
