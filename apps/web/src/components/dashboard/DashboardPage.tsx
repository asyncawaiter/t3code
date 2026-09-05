import { useCallback } from "react";
import { filterDashboardSpace } from "./DashboardPage.logic";
import { indexProfileSpaces } from "@t3tools/contracts";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useThreadActions } from "../../hooks/useThreadActions";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { toastManager } from "../ui/toast";
import { DashboardHistoryRow } from "./DashboardHistoryRow";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { Button } from "../ui/button";
import { useAtomValue } from "@effect/atom-react";
import { environmentServerConfigsAtom } from "../../state/server";
import { deriveProviderEntriesByEnvironment } from "../../providerInstances";
import {
  scopeProjectRef,
  scopeThreadRef,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import {
  buildDashboard,
  dashboardHistory,
  type DashboardLane,
} from "@t3tools/client-runtime/state/dashboard";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  PROVIDER_DISPLAY_NAMES,
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
import { Input } from "../ui/input";
import { ProfileDot } from "../sidebar/ProfileStrip";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { SidebarInset } from "../ui/sidebar";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "~/lib/utils";
import { isElectron } from "../../env";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useUiStateStore } from "../../uiStateStore";
import { usePrimarySettings } from "../../hooks/useSettings";
import {
  filterDashboardGit,
  deriveDashboardScope,
  DASHBOARD_LANE_ORDER,
  dashboardProjectKey,
  dropSeenDoneEntries,
  flattenBoardEntries,
  groupEntriesByProject,
  type DashboardBoardEntry,
} from "./DashboardPage.logic";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { DashboardCard } from "./DashboardCard";

function threadVisitedKey(shell: EnvironmentThreadShell): string {
  return scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
}

const DashboardDeviceSchema = Schema.NullOr(Schema.String);
const DashboardPrSchema = Schema.Literals(["all", "linked", "none"]);
const DashboardVisibilitySchema = Schema.Literals(["active", "snoozed", "settled", "archived"]);
const DashboardGroupSchema = Schema.Literals(["state", "project", "space"]);

const NOW_REFRESH_INTERVAL_MS = 30_000;

const LANE_TILE_LABELS: Record<DashboardLane, string> = {
  "needs-you": "Needs you",
  running: "Running",
  monitoring: "Monitoring",
  done: "Ready to review",
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
  const navigate = useNavigate();
  const now = useNow();
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  const providers = useMemo(
    () =>
      deriveProviderEntriesByEnvironment(
        [...serverConfigs].map(([id, config]) => [id, config.providers] as const),
      ),
    [serverConfigs],
  );
  const liveProjects = useProjects();
  const liveShells = useThreadShells();
  const { unsnoozeThread, unsettleThread, unarchiveThread } = useThreadActions();
  const [visibility, setVisibility] = useLocalStorage(
    "t3.dashboard.visibility",
    "active",
    DashboardVisibilitySchema,
  );
  const { environments } = useEnvironments();

  const rawProfiles = usePrimarySettings((s) => s.profiles);
  const resolvedProfiles = useMemo(() => resolveProfiles(rawProfiles), [rawProfiles]);
  const activeProfileId = useUiStateStore((store) => store.activeProfileId);
  const setActiveProfileId = useUiStateStore((store) => store.setActiveProfileId);
  const activeProfile = useMemo(
    () => findProfile(resolvedProfiles, activeProfileId) ?? ALL_PROFILE,
    [resolvedProfiles, activeProfileId],
  );
  const [spaceFilter, setSpaceFilter] = useLocalStorage("t3.dashboard.space", "all", Schema.String);
  const spaceOptions = (
    activeProfile.id === ALL_PROFILE_ID ? rawProfiles : [activeProfile]
  ).flatMap((profile) =>
    (profile.spaces ?? []).map((space) => ({
      key: `${profile.id}:${space.id}`,
      name: activeProfile.id === ALL_PROFILE_ID ? `${profile.name} / ${space.name}` : space.name,
    })),
  );
  const effectiveSpaceFilter =
    spaceFilter === "root" || spaceOptions.some((space) => space.key === spaceFilter)
      ? spaceFilter
      : "all";
  const spaceIndex = useMemo(() => indexProfileSpaces(rawProfiles), [rawProfiles]);
  const shellSpace = useCallback(
    (shell: { id: string; projectId: string; environmentId: string }) => {
      const assignment = spaceIndex.get(`${shell.environmentId}:${shell.id}`);
      if (assignment?.projectKey !== `${shell.environmentId}:${shell.projectId}`) return null;
      return {
        key: `${assignment.profile.id}:${assignment.space.id}`,
        name: assignment.space.name,
      };
    },
    [spaceIndex],
  );
  const archiveEnvironmentIds = useMemo(
    () =>
      visibility === "archived"
        ? [
            ...new Set(
              liveProjects
                .filter((project) =>
                  isProjectInProfile(
                    activeProfile,
                    scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
                  ),
                )
                .map((project) => project.environmentId),
            ),
          ]
        : [],
    [visibility, liveProjects, activeProfile],
  );
  const archive = useArchivedThreadSnapshots(archiveEnvironmentIds);
  const allProjects = useMemo(
    () =>
      visibility === "archived"
        ? [
            ...new Map(
              [
                ...liveProjects,
                ...archive.snapshots.flatMap(({ environmentId, snapshot }) =>
                  snapshot.projects.map((project) => ({ ...project, environmentId })),
                ),
              ].map((project) => [dashboardProjectKey(project.environmentId, project.id), project]),
            ).values(),
          ]
        : liveProjects,
    [visibility, liveProjects, archive.snapshots],
  );
  const allShells = useMemo(
    () =>
      visibility === "archived"
        ? archive.snapshots.flatMap(({ environmentId, snapshot }) =>
            snapshot.threads.map((shell) => ({ ...shell, environmentId })),
          )
        : liveShells,
    [visibility, liveShells, archive.snapshots],
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
      filterDashboardSpace(allShells, spaceIndex, effectiveSpaceFilter).filter((shell) =>
        visibleProjectKeys.has(
          scopedProjectKey(scopeProjectRef(shell.environmentId, shell.projectId)),
        ),
      ),
    [allShells, visibleProjectKeys, effectiveSpaceFilter, spaceIndex],
  );

  const [search, setSearch] = useLocalStorage("t3.dashboard.search", "", Schema.String);
  const [projectFilter, setProjectFilter] = useLocalStorage(
    "t3.dashboard.projectFilter",
    "all",
    Schema.String,
  );
  const [showRecent, setShowRecent] = useLocalStorage(
    "t3.dashboard.showRecent",
    false,
    Schema.Boolean,
  );
  const [environmentFilter, setEnvironmentFilter] = useLocalStorage(
    "t3.dashboard.device",
    null,
    DashboardDeviceSchema,
  );
  const [providerFilter, setProviderFilter] = useLocalStorage(
    "t3.dashboard.providerFilter",
    "all",
    Schema.String,
  );
  const profileEnvironments = environments.filter((environment) =>
    visibleProjects.some((project) => project.environmentId === environment.environmentId),
  );
  const effectiveEnvironmentFilter = profileEnvironments.some(
    (environment) => environment.environmentId === environmentFilter,
  )
    ? profileEnvironments.find((environment) => environment.environmentId === environmentFilter)!
        .environmentId
    : null;
  const {
    providerOptions,
    effectiveProviderFilter,
    projectOptions,
    effectiveProjectFilter,
    projectProviders,
    matchingShells,
  } = useMemo(
    () =>
      deriveDashboardScope(
        effectiveSpaceFilter === "all"
          ? visibleProjects
          : visibleProjects.filter((project) =>
              scopedShells.some(
                (shell) =>
                  shell.environmentId === project.environmentId && shell.projectId === project.id,
              ),
            ),
        scopedShells,
        providers,
        effectiveEnvironmentFilter,
        providerFilter,
        projectFilter,
        search,
      ),
    [
      visibleProjects,
      scopedShells,
      effectiveSpaceFilter,
      providers,
      effectiveEnvironmentFilter,
      providerFilter,
      projectFilter,
      search,
    ],
  );
  const selectedProvider = providerOptions.find(([key]) => key === effectiveProviderFilter)?.[1];
  const [branchFilter, setBranchFilter] = useLocalStorage("t3.dashboard.branch", "", Schema.String);
  const [prFilter, setPrFilter] = useLocalStorage("t3.dashboard.pr", "all", DashboardPrSchema);
  const gitShells = useMemo(
    () => filterDashboardGit(matchingShells, branchFilter, prFilter),
    [matchingShells, branchFilter, prFilter],
  );
  const board = useMemo(() => buildDashboard(gitShells, now), [gitShells, now]);
  const history = useMemo(
    () => (visibility === "active" ? [] : dashboardHistory(gitShells, now, visibility)),
    [gitShells, now, visibility],
  );

  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const unseenBoard = useMemo(
    () => dropSeenDoneEntries(board, threadLastVisitedAtById, threadVisitedKey),
    [board, threadLastVisitedAtById],
  );

  const [groupBy, setGroupBy] = useLocalStorage(
    "t3.dashboard.group",
    "state",
    DashboardGroupSchema,
  );
  const showMachineIcon = environments.length > 1;
  const filteredBoard = showRecent ? board : unseenBoard;
  const environmentByKind = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );

  const allEntries = useMemo(() => flattenBoardEntries(filteredBoard), [filteredBoard]);
  const projectGroups = useMemo(() => groupEntriesByProject(allEntries), [allEntries]);
  const visibleLanes = DASHBOARD_LANE_ORDER;

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
        spaceName={shellSpace(entry.shell)?.name}
        providerEntry={providers
          .get(entry.shell.environmentId)
          ?.get(entry.shell.session?.providerInstanceId ?? entry.shell.modelSelection.instanceId)}
        unread={
          !threadLastVisitedAtById[threadVisitedKey(entry.shell)] ||
          entry.shell.updatedAt > threadLastVisitedAtById[threadVisitedKey(entry.shell)]!
        }
        now={now}
        projectTitle={project?.title ?? ""}
        projectCwd={project?.workspaceRoot ?? ""}
        projectFaviconPath={project?.faviconPath ?? null}
        projectIcon={project?.projectIcon ?? null}
        showMachineIcon={showMachineIcon}
        machineKind={machineKind}
        deviceLabel={environmentByKind.get(entry.shell.environmentId)?.label ?? "Unknown device"}
        connected={
          environmentByKind.get(entry.shell.environmentId)?.connection.phase === "connected"
        }
      />
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader
          electron={isElectron}
          className="h-auto min-h-12 flex-wrap border-b-0 py-2"
        >
          <WorkspaceBreadcrumb ariaLabel="Dashboard">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">Dashboard</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="no-drag ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <Input
              size="compact"
              type="search"
              aria-label="Search dashboard"
              placeholder="Search tasks..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-40 min-w-0 rounded-full border-transparent bg-foreground/5 shadow-none sm:w-52"
            />
            <Button
              size="xs"
              variant="ghost"
              className="h-8 shrink-0 rounded-full bg-foreground/5 px-3 text-xs"
              onClick={() => {
                const project = projectByKey.get(effectiveProjectFilter);
                void navigate({
                  to: "/pull-requests",
                  search: {
                    involvement: "all",
                    state: "open",
                    ...(project
                      ? { environmentId: project.environmentId, projectId: project.id }
                      : effectiveEnvironmentFilter
                        ? { environmentId: effectiveEnvironmentFilter }
                        : {}),
                  },
                });
              }}
            >
              Pull requests
            </Button>
          </div>
        </WorkspacePageHeader>
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2 pt-3"
          role="group"
          aria-label="Dashboard scope"
        >
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">Scope</span>
          <Select
            value={activeProfile.id}
            onValueChange={(value) => {
              if (value !== null) {
                setActiveProfileId(value);
                setSpaceFilter("all");
                setEnvironmentFilter(null);
                setProviderFilter("all");
                setProjectFilter("all");
              }
            }}
          >
            <SelectTrigger
              size="xs"
              className="h-7 min-w-0 w-28 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
              aria-label="Filter dashboard by profile"
            >
              <SelectValue>
                <span className="flex min-w-0 items-center gap-1.5">
                  <ProfileDot color={activeProfile.color} />
                  <span className="truncate">{activeProfile.name}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {resolvedProfiles.map((profile) => (
                <SelectItem
                  className="min-h-7 text-xs sm:text-xs"
                  key={profile.id}
                  value={profile.id}
                >
                  <span className="flex items-center gap-1.5">
                    <ProfileDot color={profile.color} />
                    {profile.name}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {spaceOptions.length > 0 ? (
            <Select
              value={effectiveSpaceFilter}
              onValueChange={(value) => {
                if (value !== null) {
                  setSpaceFilter(value);
                  setProviderFilter("all");
                  setProjectFilter("all");
                }
              }}
            >
              <SelectTrigger
                size="xs"
                className="h-7 w-36 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                aria-label="Filter dashboard by space"
              >
                <SelectValue>
                  {effectiveSpaceFilter === "all"
                    ? "All spaces"
                    : effectiveSpaceFilter === "root"
                      ? "Outside spaces"
                      : spaceOptions.find((space) => space.key === effectiveSpaceFilter)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectItem value="all" className="min-h-7 text-xs">
                  All spaces
                </SelectItem>
                <SelectItem value="root" className="min-h-7 text-xs">
                  Outside spaces
                </SelectItem>
                {spaceOptions.map((space) => (
                  <SelectItem key={space.key} value={space.key} className="min-h-7 text-xs">
                    {space.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          <Select
            value={effectiveProjectFilter}
            onValueChange={(value) => setProjectFilter(value ?? "all")}
          >
            <SelectTrigger
              size="xs"
              className="h-7 w-36 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
              aria-label="Filter dashboard by project"
            >
              <SelectValue>
                {effectiveProjectFilter === "all"
                  ? "All projects"
                  : projectByKey.get(effectiveProjectFilter)?.title}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false} className="w-80 max-w-[calc(100vw-2rem)]">
              <SelectItem className="min-h-7 text-xs sm:text-xs" value="all">
                All projects
              </SelectItem>
              {projectOptions.map((project) => (
                <SelectItem
                  className="min-h-7 text-xs sm:text-xs"
                  key={dashboardProjectKey(project.environmentId, project.id)}
                  value={dashboardProjectKey(project.environmentId, project.id)}
                >
                  <span className="flex min-w-0 flex-col gap-0.5 py-1">
                    <span className="text-xs font-medium">{project.title}</span>
                    <span className="break-all text-[11px] text-muted-foreground">
                      {project.workspaceRoot}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {environmentByKind.get(project.environmentId)?.label ?? "Unknown device"}
                      </span>
                      {[
                        ...(projectProviders
                          .get(dashboardProjectKey(project.environmentId, project.id))
                          ?.entries() ?? []),
                      ].map(([key, provider]) => (
                        <span key={key} className="inline-flex items-center gap-1">
                          {provider ? (
                            <ProviderInstanceIcon
                              driverKind={provider.driverKind}
                              displayName={provider.displayName}
                              iconClassName="size-3"
                            />
                          ) : null}
                          {provider
                            ? (PROVIDER_DISPLAY_NAMES[provider.driverKind] ?? provider.driverKind)
                            : "Unknown provider"}
                        </span>
                      ))}
                      {!projectProviders.has(
                        dashboardProjectKey(project.environmentId, project.id),
                      ) ? (
                        <span>No threads</span>
                      ) : null}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>

        <div className="flex shrink-0 flex-col gap-3 px-4 pb-2">
          <div className="min-w-0" role="group" aria-label="Filter tasks">
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={effectiveEnvironmentFilter ?? "all"}
                onValueChange={(value) => {
                  setEnvironmentFilter(value === "all" ? null : (value as EnvironmentId));
                  setProviderFilter("all");
                  setProjectFilter("all");
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="h-7 w-32 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                  aria-label="Filter dashboard by device"
                >
                  <SelectValue>
                    {effectiveEnvironmentFilter === null
                      ? "All devices"
                      : environmentByKind.get(effectiveEnvironmentFilter)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  <SelectItem className="min-h-7 text-xs sm:text-xs" value="all">
                    All devices
                  </SelectItem>
                  {profileEnvironments.map((environment) => (
                    <SelectItem
                      className="min-h-7 text-xs sm:text-xs"
                      key={environment.environmentId}
                      value={environment.environmentId}
                    >
                      {environment.label}
                      {environment.connection.phase !== "connected" ? " (offline)" : ""}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select
                value={effectiveProviderFilter}
                onValueChange={(value) => {
                  setProviderFilter(value ?? "all");
                  setProjectFilter("all");
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="h-7 w-32 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                  aria-label="Filter dashboard by provider"
                >
                  <SelectValue>
                    {effectiveProviderFilter === "all"
                      ? "All providers"
                      : selectedProvider
                        ? (PROVIDER_DISPLAY_NAMES[selectedProvider.driverKind] ??
                          selectedProvider.driverKind)
                        : "Unknown provider"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  <SelectItem className="min-h-7 text-xs sm:text-xs" value="all">
                    All providers
                  </SelectItem>
                  {providerOptions.map(([key, provider]) => (
                    <SelectItem className="min-h-7 text-xs sm:text-xs" key={key} value={key}>
                      <span className="flex items-center gap-1.5">
                        {provider ? (
                          <ProviderInstanceIcon
                            driverKind={provider.driverKind}
                            displayName={provider.displayName}
                            iconClassName="size-3"
                          />
                        ) : null}
                        {provider
                          ? (PROVIDER_DISPLAY_NAMES[provider.driverKind] ?? provider.driverKind)
                          : "Unknown provider"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 rounded-full bg-foreground/5 px-3 text-xs"
                    />
                  }
                >
                  Git{branchFilter || prFilter !== "all" ? " · Filtered" : ""}
                </PopoverTrigger>
                <PopoverPopup align="start" className="w-60" viewportClassName="p-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-medium">Git filters</span>
                      <Button
                        size="micro"
                        variant="ghost-muted"
                        disabled={!branchFilter && prFilter === "all"}
                        onClick={() => {
                          setBranchFilter("");
                          setPrFilter("all");
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                    <Input
                      size="compact"
                      className="w-full"
                      list="dashboard-branches"
                      aria-label="Filter by branch"
                      placeholder="Branch..."
                      value={branchFilter}
                      onChange={(event) => setBranchFilter(event.target.value)}
                    />
                    <datalist id="dashboard-branches">
                      {[
                        ...new Set(
                          matchingShells.flatMap((shell) => (shell.branch ? [shell.branch] : [])),
                        ),
                      ]
                        .sort()
                        .map((branch) => (
                          <option key={branch} value={branch} />
                        ))}
                    </datalist>
                    <Select
                      value={prFilter}
                      onValueChange={(value) => {
                        if (value) setPrFilter(value);
                      }}
                    >
                      <SelectTrigger
                        size="xs"
                        className="h-7 w-full sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                        aria-label="Filter by linked PR"
                      >
                        <SelectValue>
                          {prFilter === "all"
                            ? "Any PR"
                            : prFilter === "linked"
                              ? "Linked PR"
                              : "No linked PR"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup alignItemWithTrigger={false}>
                        <SelectItem className="min-h-7 text-xs sm:text-xs" value="all">
                          Any PR
                        </SelectItem>
                        <SelectItem className="min-h-7 text-xs sm:text-xs" value="linked">
                          Linked PR
                        </SelectItem>
                        <SelectItem className="min-h-7 text-xs sm:text-xs" value="none">
                          No linked PR
                        </SelectItem>
                      </SelectPopup>
                    </Select>
                  </div>
                </PopoverPopup>
              </Popover>
            </div>
          </div>
          <div
            className="min-w-0 border-t border-border/50 pt-2"
            role="group"
            aria-label="Board view"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={visibility}
                onValueChange={(value) => {
                  if (value) setVisibility(value);
                }}
              >
                <SelectTrigger
                  size="xs"
                  className="h-7 w-28 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                  aria-label="Task visibility"
                >
                  <SelectValue>
                    <span className="capitalize">{visibility}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {(["active", "snoozed", "settled", "archived"] as const).map((value) => (
                    <SelectItem className="min-h-7 text-xs sm:text-xs" key={value} value={value}>
                      <span className="capitalize">{value}</span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              {visibility === "active" ? (
                <Select
                  value={groupBy}
                  onValueChange={(value) => {
                    if (value) setGroupBy(value);
                  }}
                >
                  <SelectTrigger
                    size="xs"
                    className="h-7 w-32 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                    aria-label="Group tasks"
                  >
                    <SelectValue>
                      {groupBy === "state"
                        ? "By state"
                        : groupBy === "space"
                          ? "By space"
                          : "By project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    <SelectItem className="min-h-7 text-xs sm:text-xs" value="state">
                      By state
                    </SelectItem>
                    <SelectItem className="min-h-7 text-xs sm:text-xs" value="project">
                      By project
                    </SelectItem>
                    <SelectItem className="min-h-7 text-xs sm:text-xs" value="space">
                      By space
                    </SelectItem>
                  </SelectPopup>
                </Select>
              ) : null}
              {visibility === "active" ? (
                <Select
                  value={showRecent ? "recent" : "unreviewed"}
                  onValueChange={(value) => {
                    if (value) setShowRecent(value === "recent");
                  }}
                >
                  <SelectTrigger
                    size="xs"
                    className="h-7 w-32 min-w-0 sm:h-7 rounded-full border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                    aria-label="Results to show"
                  >
                    <SelectValue>{showRecent ? "Recent 24h" : "Unreviewed"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    <SelectItem className="min-h-7 text-xs sm:text-xs" value="unreviewed">
                      Unreviewed
                    </SelectItem>
                    <SelectItem className="min-h-7 text-xs sm:text-xs" value="recent">
                      Recent 24h
                    </SelectItem>
                  </SelectPopup>
                </Select>
              ) : null}
            </div>
          </div>
        </div>
        {visibility !== "active" ? (
          <section
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
            aria-label={`${visibility} tasks`}
          >
            <div className="mb-2 flex items-center gap-2 text-xs">
              <h2 className="font-semibold capitalize">{visibility}</h2>
              <span className="text-muted-foreground">{history.length}</span>
            </div>
            {visibility === "archived" && archive.error ? (
              <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-destructive">
                {archive.error}
                <Button size="xs" variant="outline" onClick={archive.refresh}>
                  Retry
                </Button>
              </div>
            ) : null}
            {visibility === "archived" && archive.isLoading ? (
              <p className="py-2 text-xs text-muted-foreground">Loading archived tasks...</p>
            ) : null}
            <ul
              className={
                history.length
                  ? "overflow-hidden rounded-lg border border-border bg-card"
                  : undefined
              }
            >
              {history.map((shell) => {
                const project = projectByKey.get(
                  dashboardProjectKey(shell.environmentId, shell.projectId),
                );
                const environment = environmentByKind.get(shell.environmentId);
                return (
                  <DashboardHistoryRow
                    key={threadVisitedKey(shell)}
                    shell={shell}
                    spaceName={shellSpace(shell)?.name}
                    view={visibility}
                    now={now}
                    projectTitle={project?.title ?? "Unknown project"}
                    projectCwd={project?.workspaceRoot ?? ""}
                    deviceLabel={environment?.label ?? "Unknown device"}
                    connected={environment?.connection.phase === "connected"}
                    provider={providers
                      .get(shell.environmentId)
                      ?.get(shell.session?.providerInstanceId ?? shell.modelSelection.instanceId)}
                    onRestore={async () => {
                      const target = scopeThreadRef(shell.environmentId, shell.id);
                      const result = await (visibility === "archived"
                        ? unarchiveThread(target)
                        : visibility === "settled"
                          ? unsettleThread(target)
                          : unsnoozeThread(target));
                      if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
                        const error = squashAtomCommandFailure(result);
                        toastManager.add({
                          type: "error",
                          title: "Could not update task",
                          description: error instanceof Error ? error.message : "Please try again.",
                        });
                      }
                    }}
                  />
                );
              })}
            </ul>
            {!history.length &&
            !(visibility === "archived" && (archive.isLoading || archive.error)) ? (
              <p className="py-6 text-xs text-muted-foreground">
                No {visibility} tasks match these filters.
              </p>
            ) : null}
          </section>
        ) : (
          <div className="flex min-h-0 flex-1 gap-0 overflow-x-auto p-3" aria-label="Task board">
            {groupBy === "state" ? (
              visibleLanes.map((lane) => {
                const entries = filteredBoard.lanes[lane];
                return (
                  <section
                    key={lane}
                    aria-label={LANE_TILE_LABELS[lane]}
                    className="flex min-h-0 min-w-56 flex-1 flex-col border-r border-border/40 px-2 last:border-r-0"
                  >
                    <div className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          lane === "needs-you"
                            ? "bg-amber-500"
                            : lane === "running"
                              ? "bg-sky-500"
                              : lane === "monitoring"
                                ? "bg-violet-500"
                                : "bg-emerald-500",
                        )}
                      />
                      <h2 className="text-xs font-semibold">
                        {lane === "done"
                          ? showRecent
                            ? "Recent results"
                            : "Ready to review"
                          : LANE_TILE_LABELS[lane]}
                      </h2>
                      <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {entries.length}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                      {entries.length ? (
                        entries.map(renderCard)
                      ) : (
                        <p className="px-1 py-2 text-xs text-muted-foreground/70">
                          {search ||
                          branchFilter ||
                          prFilter !== "all" ||
                          effectiveProjectFilter !== "all"
                            ? "No matching tasks"
                            : lane === "needs-you"
                              ? "No requests waiting"
                              : lane === "running"
                                ? "No active tasks"
                                : lane === "monitoring"
                                  ? "No background watchers"
                                  : "No new results"}
                        </p>
                      )}
                    </div>
                  </section>
                );
              })
            ) : groupBy === "space" ? (
              [
                ...new Set(
                  DASHBOARD_LANE_ORDER.flatMap((lane) =>
                    filteredBoard.lanes[lane].map(
                      (entry) => shellSpace(entry.shell)?.key ?? "root",
                    ),
                  ),
                ),
              ].map((key) => {
                const entries = DASHBOARD_LANE_ORDER.flatMap(
                  (lane) => filteredBoard.lanes[lane],
                ).filter((entry) => (shellSpace(entry.shell)?.key ?? "root") === key);
                return (
                  <section
                    key={key}
                    className="flex min-h-0 min-w-72 flex-1 flex-col border-r border-border/40 px-2 last:border-r-0"
                  >
                    <h2 className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-semibold">
                      {spaceOptions.find((space) => space.key === key)?.name ?? "Outside spaces"}
                      <span className="text-muted-foreground">{entries.length}</span>
                    </h2>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                      {entries.map(renderCard)}
                    </div>
                  </section>
                );
              })
            ) : projectGroups.length ? (
              projectGroups.map((group) => (
                <section
                  key={group.projectKey}
                  className="flex min-h-0 min-w-72 flex-1 flex-col border-r border-border/40 px-2 last:border-r-0"
                >
                  <h2 className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-semibold">
                    {projectByKey.get(group.projectKey)?.title ?? "Unknown project"}
                    <span className="text-muted-foreground">{group.entries.length}</span>
                  </h2>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {group.entries.map(renderCard)}
                  </div>
                </section>
              ))
            ) : (
              <p className="p-3 text-xs text-muted-foreground">No tasks match this view.</p>
            )}
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
