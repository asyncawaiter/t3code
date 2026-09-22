import {
  globalDashboardNavigation,
  scopedOverviewNavigation,
} from "../../lib/globalDashboardNavigation";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Columns3Icon, LayoutDashboardIcon, FolderOpenIcon } from "lucide-react";
import { useUiStateStore } from "../../uiStateStore";
import { usePrimarySettings } from "../../hooks/useSettings";
import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { Button } from "../ui/button";
import { workspaceView } from "./workspaceView";

/** View navigation stays available while reading a chat, without changing its assignment. */
export function WorkspaceViews({
  embedded = false,
  navigationOnly = false,
  scope,
}: {
  embedded?: boolean;
  navigationOnly?: boolean;
  scope?: { profileId: string; spaceId?: string | undefined; unsorted: boolean };
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const onSpace = location.pathname.startsWith("/spaces/");
  const search = new URLSearchParams(location.searchStr);
  const onColumns = onSpace && workspaceView(search.get("view")) === "columns";
  const selectedProfileId = useUiStateStore((state) => state.activeProfileId ?? "all");
  const selectedFilter = useUiStateStore(
    (state) => state.spaceFiltersByProfile?.[selectedProfileId],
  );
  const profileId =
    (onColumns ? selectedProfileId : scope?.profileId) ??
    (onSpace ? decodeURIComponent(location.pathname.split("/")[2] ?? "all") : selectedProfileId);
  const filter = onColumns
    ? selectedFilter
    : scope
      ? scope.unsorted
        ? OUTSIDE_SPACES
        : scope.spaceId
      : onSpace
        ? search.get("unsorted") === "true"
          ? OUTSIDE_SPACES
          : search.get("space")
        : selectedFilter;
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const profile = profiles.find((item) => item.id === profileId);
  const space = profile?.spaces?.find((item) => item.id === filter);
  const view = onSpace
    ? (workspaceView(search.get("view")) ?? "overview")
    : location.pathname === "/dashboard"
      ? "overview"
      : null;
  return (
    <div
      className={`flex min-h-10 shrink-0 items-center gap-3 bg-background py-1 [-webkit-app-region:no-drag] ${navigationOnly ? "" : embedded ? "w-full" : "border-b border-border/60 px-4"}`}
    >
      {!navigationOnly && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {onColumns ? (
            "Columns"
          ) : (
            <>
              {profile?.name ?? "All"}
              <span className="px-1.5 text-muted-foreground/40">/</span>
              {space?.name ?? (filter === OUTSIDE_SPACES ? "Unsorted" : "All chats")}
            </>
          )}
        </span>
      )}
      <nav aria-label="Workspace views" className="flex shrink-0 items-center gap-0.5">
        {(
          [
            [
              "overview",
              space || filter === OUTSIDE_SPACES
                ? "Space overview"
                : profile
                  ? "Profile overview"
                  : "Dashboard",
              LayoutDashboardIcon,
            ],
            ["folders", "Folders", FolderOpenIcon],
            ["columns", "Columns", Columns3Icon],
          ] as const
        )
          .filter(([key]) => key !== "overview" || location.pathname !== "/dashboard")
          .map(([key, label, Icon]) => (
            <Button
              key={key}
              size="xs"
              variant={
                view === key || (key === "folders" && view === "branches") ? "secondary" : "ghost"
              }
              className={
                view === key || (key === "folders" && view === "branches")
                  ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                  : "text-muted-foreground"
              }
              aria-pressed={view === key || (key === "folders" && view === "branches")}
              onClick={() => {
                const overviewScope = {
                  profileId,
                  spaceId: filter && filter !== OUTSIDE_SPACES ? filter : undefined,
                  unsorted: filter === OUTSIDE_SPACES,
                };
                void navigate(
                  key === "overview"
                    ? profileId === "all" && !filter
                      ? globalDashboardNavigation()
                      : scopedOverviewNavigation(overviewScope)
                    : {
                        to: "/spaces/$profileId",
                        params: { profileId: key === "columns" ? "all" : profileId },
                        search: {
                          space: key === "columns" ? undefined : overviewScope.spaceId,
                          unsorted: key === "columns" ? false : overviewScope.unsorted,
                          view: key,
                        },
                      },
                );
              }}
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
      </nav>
    </div>
  );
}
