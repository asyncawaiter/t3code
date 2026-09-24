import { randomUUID } from "../../lib/utils";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { openCommandPalette } from "../../commandPaletteBus";
import { useWorkflowNavigation } from "../../hooks/useWorkflowNavigation";
import { useEnvironments } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { useChatBoards } from "../../hooks/useChatBoards";
import { spaceColumnsNavigation } from "./columnNavigation";
import { DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import { Input } from "../ui/input";
import { ChatModeSwitch } from "./ChatModeSwitch";
import { ProfileSpaceNavigator } from "./ProfileSpaceNavigator";
import { useAtomValue } from "@effect/atom-react";
import {
  BOARD_JUMP_KEYBINDING_COMMANDS,
  PROFILE_JUMP_KEYBINDING_COMMANDS,
  SPACE_JUMP_KEYBINDING_COMMANDS,
  resolveProfiles,
  nextProfileId,
} from "@t3tools/contracts";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  resolveShortcutCommand,
  profileTraversalDirectionFromCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import { Kbd } from "../ui/kbd";
import { useUiStateStore } from "../../uiStateStore";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  SearchIcon,
  LocateFixedIcon,
  LayoutDashboardIcon,
  LayersIcon,
  Columns3Icon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  UserRoundIcon,
  ChartNoAxesColumnIcon,
} from "lucide-react";
import { usePrimarySettings } from "../../hooks/useSettings";
import { globalDashboardNavigation } from "../../lib/globalDashboardNavigation";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { SidebarAccountControls } from "../sidebar/SidebarChrome";

/** Columns owns chat navigation. This rail only visits other parts of the app. */
export function ColumnsRail() {
  const navigate = useNavigate();
  const openThread = useWorkflowNavigation();
  const bookmark = useUiStateStore((state) => state.bookmarkedThreadKey);
  const { environments } = useEnvironments();
  const pullRequestsSupported = environments.some(
    (env) => env.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const location = useLocation();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [browsing, setBrowsing] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [name, setName] = useState("");
  const boards = useChatBoards();
  const visitBoard = (id: string) => {
    boards.setSelected(id);
    setBoardsOpen(false);
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: { view: "columns", workspace: "board", board: id, space: undefined, unsorted: false },
    });
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        browsing ||
        event.defaultPrevented ||
        event.repeat ||
        isCommandPaletteOpen() ||
        isModelPickerOpen() ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { terminalFocus: isTerminalFocused() },
      });
      const boardIndex = BOARD_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command);
      if (boardIndex >= 0) {
        const board = boards.boards[boardIndex];
        if (board) {
          event.preventDefault();
          visitBoard(board.id);
        }
        return;
      }
      if (command === "columns.focusSavedChat") {
        if (bookmark) {
          event.preventDefault();
          openThread(bookmark);
        }
        return;
      }
      const resolved = resolveProfiles(profiles);
      const activeId = useUiStateStore.getState().activeProfileId ?? "all";
      const profileIndex = PROFILE_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command);
      const spaceIndex = SPACE_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command);
      const direction = profileTraversalDirectionFromCommand(command);
      const profileId =
        direction === null
          ? resolved[profileIndex]?.id
          : nextProfileId(resolved, activeId, direction);
      if (profileId) {
        event.preventDefault();
        void navigate(spaceColumnsNavigation({ profileId, unsorted: false }));
      } else if (spaceIndex >= 0 && activeId !== "all") {
        const space = profiles.find((profile) => profile.id === activeId)?.spaces?.[spaceIndex - 1];
        if (spaceIndex > 0 && !space) return;
        event.preventDefault();
        void navigate(
          spaceColumnsNavigation({
            profileId: activeId,
            spaceId: space?.id,
            unsorted: spaceIndex === 0,
          }),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profiles, keybindings, navigate, browsing, boards.boards, bookmark, openThread]);
  return (
    <aside
      aria-label="Columns navigation"
      className="relative flex min-h-0 w-15 shrink-0 flex-col items-center gap-1.5 overflow-y-auto [scrollbar-width:none] bg-sidebar px-1.5 pb-3 pt-[var(--workspace-topbar-height)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[var(--workspace-topbar-height)] before:bg-background after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:top-[var(--workspace-topbar-height)] after:w-px after:bg-sidebar-border"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Global dashboard"
              aria-current={location.pathname === "/dashboard" ? "page" : undefined}
              className={`size-11 sm:size-11 ${location.pathname === "/dashboard" ? "bg-primary/10 text-primary" : ""}`}
              onClick={() => void navigate(globalDashboardNavigation())}
            />
          }
        >
          <LayoutDashboardIcon className="size-5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Global dashboard</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Search chats and commands"
              className="size-11 sm:size-11"
              onClick={() => openCommandPalette({ query: "" })}
            />
          }
        >
          <SearchIcon className="size-5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Search chats and commands</TooltipPopup>
      </Tooltip>
      {bookmark && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Focus saved chat"
                className="size-11 sm:size-11"
                onClick={() => {
                  openThread(bookmark);
                }}
              />
            }
          >
            <LocateFixedIcon className="size-5" />
          </TooltipTrigger>
          <TooltipPopup side="right">Focus saved chat</TooltipPopup>
        </Tooltip>
      )}
      <Popover
        open={browsing}
        onOpenChange={(open, details) => {
          // Hover already opened it; a click on the trigger should not toggle it shut.
          if (!open && details.reason === "trigger-press") return;
          setBrowsing(open);
          if (open) setBoardsOpen(false);
        }}
      >
        <PopoverTrigger
          openOnHover
          delay={40}
          closeDelay={200}
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Profiles and spaces"
              className={`size-11 sm:size-11 ${
                location.pathname.startsWith("/spaces/") &&
                new URLSearchParams(location.searchStr).get("workspace") === "space"
                  ? "bg-primary/10 text-primary"
                  : ""
              }`}
            />
          }
        >
          <LayersIcon className="size-5" />
        </PopoverTrigger>
        <PopoverPopup
          side="right"
          align="start"
          className="w-[360px] max-w-[calc(100vw-5rem)] bg-sidebar text-sidebar-foreground"
          viewportClassName="p-2"
        >
          <PopoverTitle className="sr-only">Profiles and spaces</PopoverTitle>
          <ProfileSpaceNavigator onNavigate={() => setBrowsing(false)} />
        </PopoverPopup>
      </Popover>
      <Popover
        open={boardsOpen}
        onOpenChange={(open, details) => {
          if (!open && details.reason === "trigger-press") return;
          setBoardsOpen(open);
          if (open) setBrowsing(false);
        }}
      >
        <PopoverTrigger
          openOnHover
          delay={40}
          closeDelay={200}
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Boards"
              className={`size-11 sm:size-11 ${
                location.pathname.startsWith("/spaces/") &&
                new URLSearchParams(location.searchStr).get("view") === "columns" &&
                new URLSearchParams(location.searchStr).get("workspace") !== "space"
                  ? "bg-primary/10 text-primary"
                  : ""
              }`}
            />
          }
        >
          <Columns3Icon className="size-5" />
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" className="w-72" viewportClassName="p-1.5">
          <PopoverTitle className="px-2.5 pt-1.5 pb-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Boards
          </PopoverTitle>
          <div className="max-h-80 overflow-y-auto">
            {boards.boards.map((board, index) => {
              const shortcut = BOARD_JUMP_KEYBINDING_COMMANDS[index]
                ? shortcutLabelForCommand(keybindings, BOARD_JUMP_KEYBINDING_COMMANDS[index]!)
                : null;
              const active = boards.board.id === board.id;
              return (
                <button
                  key={board.id}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => visitBoard(board.id)}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent ${active ? "bg-accent/70 font-medium" : ""}`}
                >
                  <Columns3Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{board.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {board.order.filter((key) => !board.hidden.includes(key)).length}
                  </span>
                  {shortcut && <Kbd className="min-w-7 justify-center">{shortcut}</Kbd>}
                </button>
              );
            })}
          </div>
          <div className="mt-1 border-t border-border pt-1">
            {newBoard ? (
              <form
                className="flex items-center gap-1.5 p-1"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!name.trim() || boards.pending) return;
                  const board = {
                    ...DEFAULT_CHAT_BOARD,
                    id: randomUUID(),
                    name: name.trim(),
                  };
                  if (await boards.save([board], [])) {
                    setNewBoard(false);
                    visitBoard(board.id);
                  }
                }}
              >
                <Input
                  aria-label="New board name"
                  placeholder="Board name"
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setNewBoard(false);
                    }
                  }}
                  autoFocus
                />
                <Button size="sm" type="submit" disabled={!name.trim() || boards.pending}>
                  Create
                </Button>
              </form>
            ) : (
              <button
                type="button"
                disabled={boards.pending || !!boards.unavailable}
                onClick={() => {
                  setNewBoard(true);
                  setName("");
                }}
                className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent disabled:opacity-50"
              >
                <PlusIcon className="size-4 shrink-0" />
                New board
              </button>
            )}
          </div>
          {(boards.error || boards.unavailable) && (
            <p role="status" className="px-2.5 pt-1 pb-1.5 text-xs text-muted-foreground">
              {boards.error ?? boards.unavailable}
            </p>
          )}
        </PopoverPopup>
      </Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Skills"
              aria-current={location.pathname === "/skills" ? "page" : undefined}
              className={`size-11 sm:size-11 ${location.pathname === "/skills" ? "bg-primary/10 text-primary" : ""}`}
              onClick={() => void navigate({ to: "/skills" })}
            />
          }
        >
          <SparklesIcon className="size-5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Skills</TooltipPopup>
      </Tooltip>
      <div className="mt-auto flex flex-col items-center gap-2">
        <ChatModeSwitch large />
        {pullRequestsSupported && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 sm:size-11"
                  aria-label="Pull requests"
                  onClick={() =>
                    void navigate({
                      to: "/pull-requests",
                      search: readPullRequestListPreferences(),
                    })
                  }
                />
              }
            >
              <PullRequestGlyph.pullRequest className="size-5" />
            </TooltipTrigger>
            <TooltipPopup side="right">Pull requests</TooltipPopup>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-11 sm:size-11"
                aria-label="Usage"
                onClick={() => void navigate({ to: "/usage" })}
              />
            }
          >
            <ChartNoAxesColumnIcon className="size-5" />
          </TooltipTrigger>
          <TooltipPopup side="right">Usage</TooltipPopup>
        </Tooltip>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-11 sm:size-11"
                aria-label="Account and T3 Connect"
                title="Account and T3 Connect"
              />
            }
          >
            <UserRoundIcon className="size-5" />
          </PopoverTrigger>
          <PopoverPopup side="right" align="end" className="w-64">
            <PopoverTitle className="mb-3 text-sm">Account and T3 Connect</PopoverTitle>
            <SidebarAccountControls />
          </PopoverPopup>
        </Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-11 sm:size-11"
                aria-label="Settings"
                onClick={() => void navigate({ to: "/settings" })}
              />
            }
          >
            <SettingsIcon className="size-5" />
          </TooltipTrigger>
          <TooltipPopup side="right">Settings</TooltipPopup>
        </Tooltip>
      </div>
    </aside>
  );
}
