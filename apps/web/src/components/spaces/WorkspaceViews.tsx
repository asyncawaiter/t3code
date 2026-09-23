import {
  globalDashboardNavigation,
  scopedOverviewNavigation,
} from "../../lib/globalDashboardNavigation";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboardIcon, FolderOpenIcon, ArrowLeftIcon } from "lucide-react";
import { useUiStateStore } from "../../uiStateStore";
import { usePrimarySettings } from "../../hooks/useSettings";
import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { Button } from "../ui/button";
import { columnSpaceScope, spaceColumnsNavigation, useChatMode } from "./columnNavigation";
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
  const dashboardReturn = location.state.dashboardReturn;
  const [mode] = useChatMode();
  const columnsScope = columnSpaceScope(location.pathname, location.searchStr);
  const destinationScope = scope ?? columnsScope;
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
  if (mode === "columns" && destinationScope && (onColumns || view === "overview")) {
    const owner = profiles.find((item) => item.id === destinationScope.profileId);
    const selectedSpace = owner?.spaces?.find((item) => item.id === destinationScope.spaceId);
    return (
      <div className="flex min-w-0 flex-1 items-center gap-4 py-1 no-drag">
        {!navigationOnly && (
          <span className="truncate text-sm font-medium">
            {owner?.name ?? "All"} /{" "}
            {destinationScope.unsorted ? "Unsorted" : (selectedSpace?.name ?? "All chats")}
          </span>
        )}
        <nav
          aria-label="Space views"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/40 p-0.5"
        >
          <Button
            size="xs"
            variant={onColumns ? "secondary" : "ghost"}
            className={
              onColumns ? "bg-background shadow-xs ring-1 ring-border/60" : "text-muted-foreground"
            }
            aria-current={onColumns ? "page" : undefined}
            onClick={() => void navigate(spaceColumnsNavigation(destinationScope))}
          >
            Chats
          </Button>
          <Button
            size="xs"
            variant={!onColumns ? "secondary" : "ghost"}
            className={
              !onColumns ? "bg-background shadow-xs ring-1 ring-border/60" : "text-muted-foreground"
            }
            aria-current={!onColumns ? "page" : undefined}
            onClick={() =>
              void navigate({
                to: "/spaces/$profileId",
                params: { profileId: destinationScope.profileId },
                search: { space: destinationScope.spaceId, unsorted: destinationScope.unsorted },
              })
            }
          >
            Dashboard
          </Button>
        </nav>
      </div>
    );
  }
  return (
    <div
      className={`flex min-h-10 items-center gap-3 bg-background py-1 [-webkit-app-region:no-drag] ${navigationOnly || embedded ? "min-w-0 flex-1" : "shrink-0 border-b border-border/60 px-4"}`}
    >
      {!navigationOnly && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {dashboardReturn ? (
            <Button
              size="xs"
              variant="ghost"
              className="max-w-full justify-start gap-1.5 px-1 text-muted-foreground"
              aria-label={`Return to ${dashboardReturn.label}`}
              onClick={() =>
                void navigate({
                  href: dashboardReturn.href,
                  state: { dashboardFocusKey: dashboardReturn.threadKey },
                })
              }
            >
              <ArrowLeftIcon className="size-3.5 shrink-0" />
              <span className="truncate">{dashboardReturn.label}</span>
            </Button>
          ) : onColumns ? (
            "Boards"
          ) : (
            <>
              {profile?.name ?? "All"}
              <span className="px-1.5 text-muted-foreground/40">/</span>
              {space?.name ?? (filter === OUTSIDE_SPACES ? "Unsorted" : "All chats")}
            </>
          )}
        </span>
      )}
      {!onColumns && (
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
            ] as const
          )
            .filter(([key]) => key !== "overview" || view !== "overview")
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
                          params: { profileId },
                          search: {
                            space: overviewScope.spaceId,
                            unsorted: overviewScope.unsorted,
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
      )}
    </div>
  );
}
