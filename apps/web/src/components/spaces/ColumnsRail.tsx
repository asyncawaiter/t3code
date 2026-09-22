import { useAtomValue } from "@effect/atom-react";
import {
  PROFILE_JUMP_KEYBINDING_COMMANDS,
  SPACE_JUMP_KEYBINDING_COMMANDS,
  resolveProfiles,
  nextProfileId,
} from "@t3tools/contracts";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand, profileTraversalDirectionFromCommand } from "../../keybindings";
import { useUiStateStore } from "../../uiStateStore";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboardIcon,
  LayersIcon,
  SettingsIcon,
  UserRoundIcon,
  ChartNoAxesColumnIcon,
} from "lucide-react";
import { usePrimarySettings } from "../../hooks/useSettings";
import {
  globalDashboardNavigation,
  scopedOverviewNavigation,
} from "../../lib/globalDashboardNavigation";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { SidebarAccountControls } from "../sidebar/SidebarChrome";

/** Columns owns chat navigation. This rail only visits other parts of the app. */
export function ColumnsRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
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
        void navigate(scopedOverviewNavigation({ profileId, unsorted: false }));
      } else if (spaceIndex >= 0 && activeId !== "all") {
        const space = profiles.find((profile) => profile.id === activeId)?.spaces?.[spaceIndex - 1];
        if (spaceIndex > 0 && !space) return;
        event.preventDefault();
        void navigate(
          scopedOverviewNavigation({
            profileId: activeId,
            spaceId: space?.id,
            unsorted: spaceIndex === 0,
          }),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profiles, keybindings, navigate]);
  const [browsing, setBrowsing] = useState(false);
  return (
    <aside
      aria-label="Columns navigation"
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar px-1.5 pb-3 pt-[var(--workspace-topbar-height)]"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Global dashboard"
              aria-current={location.pathname === "/dashboard" ? "page" : undefined}
              className={
                location.pathname === "/dashboard" ? "bg-primary/10 text-primary" : undefined
              }
              onClick={() => void navigate(globalDashboardNavigation())}
            />
          }
        >
          <LayoutDashboardIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="right">Global dashboard</TooltipPopup>
      </Tooltip>
      <Popover open={browsing} onOpenChange={setBrowsing}>
        <PopoverTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Profiles and spaces"
              title="Profiles and spaces"
            />
          }
        >
          <LayersIcon className="size-4" />
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" className="w-72" viewportClassName="p-3">
          <PopoverTitle className="mb-3 text-sm">Profiles and spaces</PopoverTitle>
          <div className="flex max-h-[65dvh] flex-col gap-3 overflow-y-auto">
            {profiles.map((profile) => (
              <div key={profile.id} className="space-y-0.5">
                <Button
                  className="w-full justify-start font-semibold"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBrowsing(false);
                    void navigate(
                      scopedOverviewNavigation({ profileId: profile.id, unsorted: false }),
                    );
                  }}
                >
                  {profile.name}
                </Button>
                {[{ id: "", name: "Unsorted" }, ...(profile.spaces ?? [])].map((space) => (
                  <Button
                    key={space.id}
                    className="w-full justify-start pl-6 text-muted-foreground"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setBrowsing(false);
                      void navigate(
                        scopedOverviewNavigation({
                          profileId: profile.id,
                          spaceId: space.id || undefined,
                          unsorted: !space.id,
                        }),
                      );
                    }}
                  >
                    {space.name}
                  </Button>
                ))}
              </div>
            ))}
            {!profiles.length && <p className="text-xs text-muted-foreground">No profiles yet.</p>}
          </div>
        </PopoverPopup>
      </Popover>
      <div className="mt-auto flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Usage"
                onClick={() => void navigate({ to: "/usage" })}
              />
            }
          >
            <ChartNoAxesColumnIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="right">Usage</TooltipPopup>
        </Tooltip>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Account and T3 Connect"
                title="Account and T3 Connect"
              />
            }
          >
            <UserRoundIcon className="size-4" />
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
                aria-label="Settings"
                onClick={() => void navigate({ to: "/settings" })}
              />
            }
          >
            <SettingsIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="right">Settings</TooltipPopup>
        </Tooltip>
      </div>
    </aside>
  );
}
