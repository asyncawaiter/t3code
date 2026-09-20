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
  scope,
}: {
  embedded?: boolean;
  scope?: { profileId: string; spaceId?: string | undefined; unsorted: boolean };
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const onSpace = location.pathname.startsWith("/spaces/");
  const search = new URLSearchParams(location.searchStr);
  const selectedProfileId = useUiStateStore((state) => state.activeProfileId ?? "all");
  const selectedFilter = useUiStateStore(
    (state) => state.spaceFiltersByProfile?.[selectedProfileId],
  );
  const profileId =
    scope?.profileId ??
    (onSpace ? decodeURIComponent(location.pathname.split("/")[2] ?? "all") : selectedProfileId);
  const filter = scope
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
      className={`flex min-h-10 shrink-0 items-center gap-3 bg-background py-1 [-webkit-app-region:no-drag] ${embedded ? "w-full" : "border-b border-border/60 px-4"}`}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {profile?.name ?? "All"}
        <span className="px-1.5 text-muted-foreground/40">/</span>
        {`${space?.name ?? (filter === OUTSIDE_SPACES ? "Unsorted" : "All chats")}${view === "columns" ? " board" : ""}`}
      </span>
      <nav aria-label="Workspace views" className="flex shrink-0 items-center gap-0.5">
        {(
          [
            ["overview", "Dashboard", LayoutDashboardIcon],
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
              onClick={() =>
                void (key === "overview" && !onSpace && profileId === "all" && !filter
                  ? navigate({ to: "/dashboard" })
                  : navigate({
                      to: "/spaces/$profileId",
                      params: { profileId },
                      search: {
                        space: filter && filter !== OUTSIDE_SPACES ? filter : undefined,
                        unsorted: filter === OUTSIDE_SPACES,
                        view: key === "overview" ? undefined : key,
                      },
                    }))
              }
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
      </nav>
    </div>
  );
}
