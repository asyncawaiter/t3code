import { useLocation, useNavigate } from "@tanstack/react-router";
import { Columns3Icon, MessageSquareIcon, ListFilterIcon } from "lucide-react";
import { selectSidebarSpace, useUiStateStore } from "../../uiStateStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Button } from "../ui/button";
import {
  isColumnsLocation,
  useChatMode,
  useColumnNavigation,
  ChatReturnLocation,
  DEFAULT_CHAT_RETURN,
} from "./columnNavigation";

export function ChatModeSwitch() {
  const location = useLocation();
  const navigate = useNavigate();
  const columns = isColumnsLocation(location.pathname, location.searchStr);
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
    if (value !== "chat" && value !== "columns") return;
    setMode(value);
    useColumnNavigation.setState({ choosing: false });
    if (value === "columns") openBoard();
    else openChat();
  }
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 no-drag">
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
        role="group"
        aria-label="Workspace mode"
        className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5"
      >
        {(
          [
            ["chat", "Chat", MessageSquareIcon],
            ["columns", "Columns", Columns3Icon],
          ] as const
        ).map(([value, label, Icon]) => (
          <Button
            key={value}
            size="xs"
            variant="ghost"
            aria-label={`Open ${label} workspace`}
            aria-pressed={selectedColumns === (value === "columns")}
            onClick={() => changeMode(value)}
            className={
              selectedColumns === (value === "columns")
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/60"
                : "text-muted-foreground"
            }
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
