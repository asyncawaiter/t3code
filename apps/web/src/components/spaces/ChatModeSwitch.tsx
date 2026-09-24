import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Columns3Icon, MessageSquareIcon, PanelsTopLeftIcon, CheckIcon } from "lucide-react";
import { selectSidebarSpace, useUiStateStore } from "../../uiStateStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { useThreadShells } from "../../state/entities";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  isColumnsLocation,
  useChatMode,
  useColumnNavigation,
  ChatReturnLocation,
  DEFAULT_CHAT_RETURN,
  isDashboardLocation,
  columnSpaceScope,
  spaceColumnsNavigation,
} from "./columnNavigation";

/** `large` matches the columns rail's oversized buttons. */
export function ChatModeSwitch({ large = false }: { large?: boolean }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const columns = isColumnsLocation(location.pathname, location.searchStr);
  const [mode, setMode] = useChatMode();
  const selectedColumns = mode === "columns";
  const threads = useThreadShells();
  const [lastChat] = useLocalStorage(
    "t3.workspace.chat-return",
    DEFAULT_CHAT_RETURN,
    ChatReturnLocation,
  );
  function openChat() {
    useUiStateStore.getState().setActiveProfileId(lastChat.profileId);
    useUiStateStore.setState((state) =>
      selectSidebarSpace(state, lastChat.profileId ?? "all", lastChat.space),
    );
    void navigate({
      href:
        lastChat.href.startsWith("/") &&
        !lastChat.href.startsWith("//") &&
        !lastChat.href.startsWith("/spaces/")
          ? lastChat.href
          : "/dashboard",
    });
  }
  function changeMode(value: string) {
    if ((value !== "chat" && value !== "columns") || value === mode) return;
    setMode(value);
    useColumnNavigation.setState({ choosing: false });
    if (
      isDashboardLocation(location.pathname, location.searchStr) ||
      (location.pathname.startsWith("/spaces/") && !columns)
    )
      return;
    if (value === "columns") {
      const scope = columnSpaceScope(location.pathname, location.searchStr);
      if (scope) void navigate(spaceColumnsNavigation(scope));
      else {
        const thread = threads.find(
          (chat) => location.pathname === `/${chat.environmentId}/${chat.id}`,
        );
        if (!thread) return;
        const ui = useUiStateStore.getState();
        const profileId = ui.activeProfileId ?? "all";
        const filter = ui.spaceFiltersByProfile?.[profileId];
        void navigate(
          spaceColumnsNavigation(
            {
              profileId,
              spaceId: filter && filter !== OUTSIDE_SPACES ? filter : undefined,
              unsorted: filter === OUTSIDE_SPACES,
            },
            `${thread.environmentId}:${thread.id}`,
          ),
        );
      }
    } else if (columns) {
      const scope = columnSpaceScope(location.pathname, location.searchStr);
      if (scope) {
        useUiStateStore
          .getState()
          .setActiveProfileId(scope.profileId === "all" ? null : scope.profileId);
        useUiStateStore.setState((state) =>
          selectSidebarSpace(
            state,
            scope.profileId,
            scope.unsorted ? OUTSIDE_SPACES : (scope.spaceId ?? null),
          ),
        );
        void navigate({
          to: "/spaces/$profileId",
          params: { profileId: scope.profileId },
          search: { space: scope.spaceId, unsorted: scope.unsorted },
        });
      } else openChat();
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Conversation layout: ${selectedColumns ? "Columns" : "Chat"}`}
                  className={large ? "size-14 sm:size-14" : undefined}
                />
              }
            />
          }
        >
          <PanelsTopLeftIcon className={large ? "size-6" : "size-4"} />
        </TooltipTrigger>
        <TooltipPopup side="right">
          Conversation layout: {selectedColumns ? "Columns" : "Chat"}
        </TooltipPopup>
      </Tooltip>
      <PopoverPopup side="right" align="end" className="w-64" viewportClassName="p-2">
        <PopoverTitle className="px-2 py-2 text-sm">Conversation layout</PopoverTitle>
        <div role="group" aria-label="Conversation layout" className="space-y-1">
          {(
            [
              ["chat", "Chat", "One conversation at a time", MessageSquareIcon],
              ["columns", "Columns", "Conversations side by side", Columns3Icon],
            ] as const
          ).map(([value, label, description, Icon]) => (
            <Button
              key={value}
              variant={mode === value ? "secondary" : "ghost"}
              aria-label={`${label} conversation layout`}
              aria-pressed={mode === value}
              className="h-auto w-full justify-start gap-3 px-2 py-2 text-left"
              onClick={() => {
                setOpen(false);
                changeMode(value);
              }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{label}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {description}
                </span>
              </span>
              {mode === value && <CheckIcon className="size-3.5 shrink-0" />}
            </Button>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
