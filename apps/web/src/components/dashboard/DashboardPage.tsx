import {
  scopeProjectRef,
  scopeThreadRef,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import { buildDashboard, type DashboardLane } from "@t3tools/client-runtime/state/dashboard";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  ALL_PROFILE,
  ALL_PROFILE_ID,
  findProfile,
  isProjectInProfile,
  resolveEnvironmentMachineKind,
  resolveProfiles,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useMemo, useState, useEffect } from "react";

import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { SidebarInset } from "../ui/sidebar";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "~/lib/utils";
import { isElectron } from "../../env";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useUiStateStore } from "../../uiStateStore";
import { usePrimarySettings } from "../../hooks/useSettings";
import {
  DASHBOARD_LANE_ORDER,
  dashboardProjectKey,
  dropSeenDoneEntries,
  filterBoardByEnvironment,
  filterEntriesByLane,
  flattenBoardEntries,
  groupEntriesByProject,
  type DashboardBoardEntry,
} from "./DashboardPage.logic";
import { DashboardCard } from "./DashboardCard";

function threadVisitedKey(shell: EnvironmentThreadShell): string {
  return scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
}

const NOW_REFRESH_INTERVAL_MS = 30_000;

const LANE_TILE_LABELS: Record<DashboardLane, string> = {
  "needs-you": "Needs you",
  running: "Running",
  monitoring: "Monitoring",
  done: "Done",
};

function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().toISOString()), NOW_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
  return now;
}

export function DashboardPage() {
  const now = useNow();
  const allProjects = useProjects();
  const allShells = useThreadShells();
  const { environments } = useEnvironments();

  const rawProfiles = usePrimarySettings((s) => s.profiles);
  const resolvedProfiles = useMemo(() => resolveProfiles(rawProfiles), [rawProfiles]);
  const activeProfileId = useUiStateStore((store) => store.activeProfileId);
  const activeProfile = useMemo(
    () => findProfile(resolvedProfiles, activeProfileId) ?? ALL_PROFILE,
    [resolvedProfiles, activeProfileId],
  );
  const visibleProjects = useMemo(
    () =>
      activeProfile.id === ALL_PROFILE_ID
        ? allProjects
        : allProjects.filter((project) =>
            isProjectInProfile(
              activeProfile,
              scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
            ),
          ),
    [activeProfile, allProjects],
  );
  const visibleProjectKeys = useMemo(
    () =>
      new Set(
        visibleProjects.map((project) =>
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
        ),
      ),
    [visibleProjects],
  );
  const projectByKey = useMemo(
    () =>
      new Map(
        visibleProjects.map((project) => [
          dashboardProjectKey(project.environmentId, project.id),
          project,
        ]),
      ),
    [visibleProjects],
  );

  const scopedShells = useMemo(
    () =>
      allShells.filter((shell) =>
        visibleProjectKeys.has(
          scopedProjectKey(scopeProjectRef(shell.environmentId, shell.projectId)),
        ),
      ),
    [allShells, visibleProjectKeys],
  );

  const board = useMemo(() => buildDashboard(scopedShells, now), [scopedShells, now]);

  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const unseenBoard = useMemo(
    () => dropSeenDoneEntries(board, threadLastVisitedAtById, threadVisitedKey),
    [board, threadLastVisitedAtById],
  );

  const [groupBy, setGroupBy] = useState<"state" | "project">("state");
  const [laneFilter, setLaneFilter] = useState<DashboardLane | null>(null);
  const [environmentFilter, setEnvironmentFilter] = useState<EnvironmentId | null>(null);

  const connectedEnvironments = useMemo(
    () => environments.filter((environment) => environment.connection.phase === "connected"),
    [environments],
  );
  const showMachineIcon = environments.length > 1;
  const showEnvironmentFilter = connectedEnvironments.length > 1;

  // A previously-picked environment can disconnect out from under the
  // filter; derive back to "all" rather than silently showing a stale board.
  const effectiveEnvironmentFilter =
    environmentFilter !== null &&
    connectedEnvironments.some((environment) => environment.environmentId === environmentFilter)
      ? environmentFilter
      : null;

  // Environment filter applies before counts so tiles, section counts, and
  // the empty state all agree with what actually renders.
  const filteredBoard = useMemo(
    () => filterBoardByEnvironment(unseenBoard, effectiveEnvironmentFilter),
    [effectiveEnvironmentFilter, unseenBoard],
  );
  const boardEmpty =
    filteredBoard.counts["needs-you"] +
      filteredBoard.counts.running +
      filteredBoard.counts.monitoring +
      filteredBoard.counts.done ===
    0;

  const environmentByKind = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );

  const allEntries = useMemo(() => flattenBoardEntries(filteredBoard), [filteredBoard]);
  const projectGroupEntries = useMemo(
    () => filterEntriesByLane(allEntries, laneFilter),
    [allEntries, laneFilter],
  );
  const projectGroups = useMemo(
    () => groupEntriesByProject(projectGroupEntries),
    [projectGroupEntries],
  );

  const visibleLanes = laneFilter ? [laneFilter] : DASHBOARD_LANE_ORDER;

  function renderCard(entry: DashboardBoardEntry) {
    const project = projectByKey.get(
      dashboardProjectKey(entry.shell.environmentId, entry.shell.projectId),
    );
    const machineKind = resolveEnvironmentMachineKind(
      environmentByKind.get(entry.shell.environmentId)?.serverConfig ?? null,
    );
    return (
      <DashboardCard
        key={`${entry.shell.environmentId}:${entry.shell.id}`}
        entry={entry}
        now={now}
        projectTitle={project?.title ?? ""}
        projectCwd={project?.workspaceRoot ?? ""}
        projectFaviconPath={project?.faviconPath ?? null}
        projectIcon={project?.projectIcon ?? null}
        showMachineIcon={showMachineIcon}
        machineKind={machineKind}
      />
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <WorkspaceBreadcrumb ariaLabel="Dashboard">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">Dashboard</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        </WorkspacePageHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspacePageContainer width="expanded" className="gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DASHBOARD_LANE_ORDER.map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setLaneFilter((current) => (current === lane ? null : lane))}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors",
                    laneFilter === lane && "border-foreground/30 bg-accent",
                  )}
                >
                  <span className="text-xs text-muted-foreground/80">{LANE_TILE_LABELS[lane]}</span>
                  <span className="text-lg font-semibold text-foreground">
                    {board.counts[lane]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                variant="segmented"
                size="sm"
                value={[groupBy]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "state" || next === "project") setGroupBy(next);
                }}
              >
                <Toggle aria-label="Group by state" value="state">
                  State
                </Toggle>
                <Toggle aria-label="Group by project" value="project">
                  Project
                </Toggle>
              </ToggleGroup>

              {showEnvironmentFilter ? (
                <Select
                  value={effectiveEnvironmentFilter ?? "all"}
                  onValueChange={(value) =>
                    setEnvironmentFilter(value === "all" ? null : (value as EnvironmentId))
                  }
                >
                  <SelectTrigger size="sm" className="w-48" aria-label="Filter by environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup align="start">
                    <SelectItem value="all">All environments</SelectItem>
                    {connectedEnvironments.map((environment) => (
                      <SelectItem key={environment.environmentId} value={environment.environmentId}>
                        {environment.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              ) : null}
            </div>

            {boardEmpty ? (
              <Empty className="flex-1">
                <div className="w-full max-w-lg px-8 py-12">
                  <EmptyHeader className="max-w-none">
                    <EmptyTitle className="text-foreground text-xl">Nothing needs you</EmptyTitle>
                    <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                      Every thread across your projects is caught up.
                    </EmptyDescription>
                  </EmptyHeader>
                </div>
              </Empty>
            ) : groupBy === "state" ? (
              <div className="flex flex-col gap-6">
                {visibleLanes.map((lane) => {
                  const entries = filteredBoard.lanes[lane];
                  return (
                    <section key={lane} className="flex flex-col gap-2">
                      <h2 className="text-sm font-medium text-foreground">
                        {LANE_TILE_LABELS[lane]}{" "}
                        <span className="text-muted-foreground/70">({entries.length})</span>
                      </h2>
                      {entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground/70">Nothing here.</p>
                      ) : (
                        <div className="flex flex-col gap-2">{entries.map(renderCard)}</div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : projectGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">Nothing here.</p>
            ) : (
              <div className="flex flex-col gap-6">
                {projectGroups.map((group) => {
                  const project = projectByKey.get(group.projectKey);
                  return (
                    <section key={group.projectKey} className="flex flex-col gap-2">
                      <h2 className="text-sm font-medium text-foreground">
                        {project?.title ?? "Unknown project"}{" "}
                        <span className="text-muted-foreground/70">({group.entries.length})</span>
                      </h2>
                      <div className="flex flex-col gap-2">{group.entries.map(renderCard)}</div>
                    </section>
                  );
                })}
              </div>
            )}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}
