import { useLocation, useNavigate } from "@tanstack/react-router";
import { Columns3Icon, MessageSquareIcon, ListFilterIcon } from "lucide-react";
import { selectSidebarSpace, useUiStateStore } from "../../uiStateStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Button } from "../ui/button";
import {
  isColumnsLocation,
  isDashboardLocation,
  useChatMode,
  useColumnNavigation,
  ChatReturnLocation,
  DEFAULT_CHAT_RETURN,
} from "./columnNavigation";

export function ChatModeSwitch() {
  const location = useLocation();
  const navigate = useNavigate();
  const columns = isColumnsLocation(location.pathname, location.searchStr);
  const dashboard = isDashboardLocation(location.pathname, location.searchStr);
  const [mode, setMode] = useChatMode();
  const selectedColumns = columns || mode === "columns";
  const openBoard = () =>
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: { view: "columns", unsorted: false, space: undefined },
    });
  const [lastChat] = useLocalStorage(
    "t3.workspace.chat-return",
    DEFAULT_CHAT_RETURN,
    ChatReturnLocation,
  );
  const choosing = useColumnNavigation((state) => state.choosing);
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 no-drag">
      {dashboard && mode === "columns" && (
        <Button size="xs" variant="ghost" onClick={openBoard}>
          Open board
        </Button>
      )}
      {dashboard && <span className="text-xs text-muted-foreground">Open chats in</span>}
      {columns && (
        <Button
          size="xs"
          variant={choosing ? "secondary" : "outline"}
          aria-haspopup="dialog"
          aria-expanded={choosing}
          onClick={() => useColumnNavigation.setState({ choosing: !choosing })}
        >
          <ListFilterIcon className="size-3.5" />
          Choose chats
        </Button>
      )}
      <div
        aria-label={dashboard ? "Open chats in" : "Chat layout"}
        role="group"
        className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5"
      >
        {(
          [
            [false, "Chat", MessageSquareIcon],
            [true, "Columns", Columns3Icon],
          ] as const
        ).map(([isColumns, label, Icon]) => (
          <Button
            key={label}
            size="xs"
            variant="ghost"
            aria-pressed={selectedColumns === isColumns}
            className={
              selectedColumns === isColumns
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/60"
                : "text-muted-foreground"
            }
            onClick={() => {
              if ((dashboard || columns) && selectedColumns === isColumns) return;
              setMode(isColumns ? "columns" : "chat");
              if (dashboard) return;
              useColumnNavigation.setState({ choosing: false });
              if (isColumns) openBoard();
              else {
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
            }}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
