import { TaskShelf } from "../tasks/TaskShelf";
import { openWorkItem, useWorkItems } from "../../workItems";
import { DashboardSavedViews, type DashboardView } from "./DashboardSavedViews";
import { useWorkflowState } from "../../workflowState";
import { buildReviewDashboard } from "./DashboardPage.logic";
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
import {
  useLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from "../../hooks/useLocalStorage";
import { useNavigate } from "@tanstack/react-router";
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
import { dashboardHistory, type DashboardLane } from "@t3tools/client-runtime/state/dashboard";
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
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";

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
import { selectSidebarSpace, useUiStateStore } from "../../uiStateStore";
import { WorkspaceViews } from "../spaces/WorkspaceViews";
import { OUTSIDE_SPACES, spaceProjectKeys } from "../sidebar/Spaces.logic";
import { openChatCreation } from "../../chatCreationStore";
import { usePrimarySettings } from "../../hooks/useSettings";
import {
  filterDashboardGit,
  deriveDashboardScope,
  DASHBOARD_LANE_ORDER,
  dashboardProjectKey,
  dropReviewedDoneEntries,
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

export function DashboardPage({
  scope,
}: {
  scope?: { profileId: string; spaceId?: string | undefined; unsorted: boolean };
}) {
  const storageScope = scope
    ? `t3.dashboard.${scope.profileId}:${scope.spaceId ?? scope.unsorted}`
    : "t3.dashboard.global";
  const [globalProfileId, setDashboardProfileId] = useLocalStorage(
    "t3.dashboard.global.profileFilter",
    null,
    Schema.NullOr(Schema.String),
  );
  const [globalSpace, setGlobalSpace] = useLocalStorage(
    "t3.dashboard.global.spaceFilter",
    "all",
    Schema.String,
  );
  const setGlobalProfileId = useUiStateStore((state) => state.setActiveProfileId);
  useEffect(() => {
    if (!scope) setGlobalProfileId(globalProfileId);
  }, [scope, globalProfileId, setGlobalProfileId]);
  const navigate = useNavigate();
  const workItems = useWorkItems();
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
    `${storageScope}.visibility`,
    "active",
    DashboardVisibilitySchema,
  );
  const boardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (visibility !== "active") return;
    const node = boardRef.current;
    if (!node) return;
    const scrollKey = `${storageScope}.scroll`;
    let position = 0;
    try {
      position = getLocalStorageItem(scrollKey, Schema.Finite) ?? 0;
    } catch {
      // A stale scroll preference must not prevent opening the dashboard.
    }
    node.scrollTop = position;
    const track = () => {
      position = node.scrollTop;
    };
    const save = () => {
      try {
        setLocalStorageItem(scrollKey, position, Schema.Finite);
      } catch {
        // Scrolling remains usable when browser storage is unavailable.
      }
    };
    node.addEventListener("scroll", track, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      node.removeEventListener("scroll", track);
      window.removeEventListener("pagehide", save);
    };
  }, [visibility, storageScope]);
  const { environments } = useEnvironments();

  const rawProfiles = usePrimarySettings((s) => s.profiles);
  const resolvedProfiles = useMemo(() => resolveProfiles(rawProfiles), [rawProfiles]);
  const activeProfileId = scope?.profileId ?? globalProfileId;
  function setScope(profileId: string | null, spaceKey: string) {
    const owner = rawProfiles.find((profile) =>
      profile.spaces?.some((space) => `${profile.id}:${space.id}` === spaceKey),
    );
    if (!scope) {
      setDashboardProfileId(owner?.id ?? profileId);
      setGlobalSpace(spaceKey);
      return;
    }
    const space = owner?.spaces?.find((space) => `${owner.id}:${space.id}` === spaceKey);
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: owner?.id ?? profileId ?? ALL_PROFILE_ID },
      search: { space: space?.id, unsorted: spaceKey === "root" },
    });
  }
  const setSpaceFilter = (space: string) => setScope(activeProfileId, space);
  const activeProfile = useMemo(
    () => findProfile(resolvedProfiles, activeProfileId) ?? ALL_PROFILE,
    [resolvedProfiles, activeProfileId],
  );
  const spaceFilter = scope
    ? scope.unsorted
      ? "root"
      : scope.spaceId
        ? `${scope.profileId}:${scope.spaceId}`
        : "all"
    : globalSpace;
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
  const selectedSpaceOwner = rawProfiles.find((owner) =>
    owner.spaces?.some((space) => `${owner.id}:${space.id}` === effectiveSpaceFilter),
  );
  const selectedSpace = selectedSpaceOwner?.spaces?.find(
    (space) => `${selectedSpaceOwner.id}:${space.id}` === effectiveSpaceFilter,
  );
  useEffect(() => {
    const profileId = selectedSpaceOwner?.id ?? activeProfile.id;
    if (scope)
      useUiStateStore
        .getState()
        .setActiveProfileId(profileId === ALL_PROFILE_ID ? null : profileId);
    useUiStateStore.setState((state) =>
      selectSidebarSpace(
        state,
        profileId,
        selectedSpace?.id ?? (effectiveSpaceFilter === "root" ? OUTSIDE_SPACES : null),
      ),
    );
  }, [scope, activeProfile.id, selectedSpaceOwner?.id, selectedSpace?.id, effectiveSpaceFilter]);
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

  const [search, setSearch] = useLocalStorage(`${storageScope}.search`, "", Schema.String);
  const [projectFilter, setProjectFilter] = useLocalStorage(
    `${storageScope}.projectFilter`,
    "all",
    Schema.String,
  );
  const [showRecent, setShowRecent] = useLocalStorage(
    `${storageScope}.showRecent`,
    false,
    Schema.Boolean,
  );
  const [environmentFilter, setEnvironmentFilter] = useLocalStorage(
    `${storageScope}.device`,
    null,
    DashboardDeviceSchema,
  );
  const [providerFilter, setProviderFilter] = useLocalStorage(
    `${storageScope}.providerFilter`,
    "all",
    Schema.String,
  );
  const scopeProjects = useMemo(() => {
    if (effectiveSpaceFilter === "all") return visibleProjects;
    const keys = new Set(
      selectedSpace
        ? spaceProjectKeys(selectedSpace)
        : scopedShells.map((shell) => `${shell.environmentId}:${shell.projectId}`),
    );
    return visibleProjects.filter((project) => keys.has(`${project.environmentId}:${project.id}`));
  }, [effectiveSpaceFilter, visibleProjects, selectedSpace, scopedShells]);
  const profileEnvironments = environments.filter((environment) =>
    scopeProjects.some((project) => project.environmentId === environment.environmentId),
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
        scopeProjects,
        scopedShells,
        providers,
        effectiveEnvironmentFilter,
        providerFilter,
        projectFilter,
        search,
      ),
    [
      scopeProjects,
      scopedShells,
      providers,
      effectiveEnvironmentFilter,
      providerFilter,
      projectFilter,
      search,
    ],
  );
  const selectedProvider = providerOptions.find(([key]) => key === effectiveProviderFilter)?.[1];
  const [branchFilter, setBranchFilter] = useLocalStorage(
    `${storageScope}.branch`,
    "",
    Schema.String,
  );
  const [prFilter, setPrFilter] = useLocalStorage(`${storageScope}.pr`, "all", DashboardPrSchema);
  const gitShells = useMemo(
    () => filterDashboardGit(matchingShells, branchFilter, prFilter),
    [matchingShells, branchFilter, prFilter],
  );
  const reviewed = useWorkflowState((s) => s.reviewed);
  const kept = useWorkflowState((s) => s.kept);
  const board = useMemo(() => buildReviewDashboard(gitShells, now, kept), [gitShells, now, kept]);
  const history = useMemo(
    () => (visibility === "active" ? [] : dashboardHistory(gitShells, now, visibility)),
    [gitShells, now, visibility],
  );

  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const unseenBoard = useMemo(
    () => dropReviewedDoneEntries(board, reviewed, threadVisitedKey),
    [board, reviewed],
  );

  const [groupBy, setGroupBy] = useLocalStorage(
    `${storageScope}.group`,
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

  const activeFilters = [
    ...(search ? [{ label: `Search: ${search}`, clear: () => setSearch("") }] : []),
    ...(effectiveProjectFilter !== "all"
      ? [
          {
            label: `Project: ${projectByKey.get(effectiveProjectFilter)?.title ?? "Unknown"}`,
            clear: () => setProjectFilter("all"),
          },
        ]
      : []),
    ...(effectiveEnvironmentFilter
      ? [
          {
            label: `Device: ${environmentByKind.get(effectiveEnvironmentFilter)?.label ?? "Unknown"}`,
            clear: () => {
              setEnvironmentFilter(null);
              setProviderFilter("all");
              setProjectFilter("all");
            },
          },
        ]
      : []),
    ...(effectiveProviderFilter !== "all"
      ? [
          {
            label: `Provider: ${selectedProvider ? (PROVIDER_DISPLAY_NAMES[selectedProvider.driverKind] ?? selectedProvider.driverKind) : "Unknown"}`,
            clear: () => {
              setProviderFilter("all");
              setProjectFilter("all");
            },
          },
        ]
      : []),
    ...(branchFilter
      ? [{ label: `Branch: ${branchFilter}`, clear: () => setBranchFilter("") }]
      : []),
    ...(prFilter !== "all"
      ? [
          {
            label: prFilter === "linked" ? "Linked PR" : "No linked PR",
            clear: () => setPrFilter("all"),
          },
        ]
      : []),
  ];
  const currentView: DashboardView = {
    profileId: activeProfile.id,
    space: effectiveSpaceFilter,
    project: effectiveProjectFilter,
    device: effectiveEnvironmentFilter,
    provider: effectiveProviderFilter,
    search,
    branch: branchFilter,
    pr: prFilter,
    visibility,
    group: groupBy,
    recent: showRecent,
  };
  function applyView(view: DashboardView) {
    const profile = resolvedProfiles.find((item) => item.id === view.profileId);
    const spaceExists =
      view.space === "all" ||
      view.space === "root" ||
      rawProfiles.some(
        (item) =>
          (view.profileId === ALL_PROFILE_ID || item.id === view.profileId) &&
          item.spaces?.some((space) => `${item.id}:${space.id}` === view.space),
      );
    const projects = profile
      ? allProjects.filter((item) =>
          isProjectInProfile(profile, `${item.environmentId}:${item.id}`),
        )
      : [];
    const shells = filterDashboardSpace(allShells, spaceIndex, view.space).filter((item) =>
      projects.some(
        (project) => project.environmentId === item.environmentId && project.id === item.projectId,
      ),
    );
    const device = view.device
      ? environments.find((item) => item.environmentId === view.device)?.environmentId
      : null;
    const savedScope = deriveDashboardScope(
      projects,
      shells,
      providers,
      device ?? null,
      view.provider,
      view.project,
      view.search,
    );
    if (
      !profile ||
      !spaceExists ||
      (view.device && !device) ||
      savedScope.effectiveProjectFilter !== view.project ||
      savedScope.effectiveProviderFilter !== view.provider
    ) {
      toastManager.add({
        type: "error",
        title: "Saved view is unavailable",
        description:
          "A profile, Space, device, provider or project in this view is no longer available. Your current view has been kept.",
      });
      return;
    }
    if (scope) {
      const targetSpace = rawProfiles
        .flatMap((owner) => (owner.spaces ?? []).map((space) => ({ owner, space })))
        .find(({ owner, space }) => `${owner.id}:${space.id}` === view.space);
      const key = `t3.dashboard.${targetSpace?.owner.id ?? profile.id}:${targetSpace?.space.id ?? view.space === "root"}`;
      setLocalStorageItem(`${key}.projectFilter`, view.project, Schema.String);
      setLocalStorageItem(`${key}.device`, device ?? null, DashboardDeviceSchema);
      setLocalStorageItem(`${key}.providerFilter`, view.provider, Schema.String);
      setLocalStorageItem(`${key}.search`, view.search, Schema.String);
      setLocalStorageItem(`${key}.branch`, view.branch, Schema.String);
      setLocalStorageItem(`${key}.pr`, view.pr, DashboardPrSchema);
      setLocalStorageItem(`${key}.visibility`, view.visibility, DashboardVisibilitySchema);
      setLocalStorageItem(`${key}.group`, view.group, DashboardGroupSchema);
      setLocalStorageItem(`${key}.showRecent`, view.recent, Schema.Boolean);
      setLocalStorageItem(`${key}.scroll`, 0, Schema.Finite);
      if (key !== storageScope) {
        setScope(profile.id === ALL_PROFILE_ID ? null : profile.id, view.space);
        return;
      }
    }
    setScope(profile.id === ALL_PROFILE_ID ? null : profile.id, view.space);
    setProjectFilter(view.project);
    setEnvironmentFilter(device ?? null);
    setProviderFilter(view.provider);
    setSearch(view.search);
    setBranchFilter(view.branch);
    setPrFilter(view.pr);
    setVisibility(view.visibility);
    setGroupBy(view.group);
    setShowRecent(view.recent);
    if (boardRef.current) boardRef.current.scrollTop = 0;
  }
  function resetFilters() {
    setSearch("");
    setProjectFilter("all");
    setEnvironmentFilter(null);
    setProviderFilter("all");
    setBranchFilter("");
    setPrFilter("all");
  }
  const resultsControl = (
    <Select
      disabled={visibility !== "active"}
      value={showRecent ? "recent" : "unreviewed"}
      onValueChange={(value) => {
        if (value) setShowRecent(value === "recent");
      }}
    >
      <SelectTrigger
        size="xs"
        className="h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
        aria-label="Results to show"
      >
        <SelectValue>{showRecent ? "Recent 24h" : "Unreviewed results"}</SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        <SelectItem className="min-h-7 text-xs sm:text-xs" value="unreviewed">
          Unreviewed results
        </SelectItem>
        <SelectItem className="min-h-7 text-xs sm:text-xs" value="recent">
          Recent 24h
        </SelectItem>
      </SelectPopup>
    </Select>
  );

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
        task={workItems.find(
          (task) =>
            task.environmentId === entry.shell.environmentId &&
            task.item.threadId === entry.shell.id,
        )}
        onOpen={() =>
          useWorkflowState.setState({
            triageProfileId: activeProfile.id,
            triageSpaceId: scope?.spaceId,
            triageUnsorted: scope?.unsorted,
            triageScoped: !!scope,
            triageQueue: allEntries
              .filter((item) => item.lane === "needs-you" || item.lane === "done")
              .map((item) => threadVisitedKey(item.shell)),
          })
        }
        spaceName={shellSpace(entry.shell)?.name ?? "Unsorted"}
        providerEntry={providers
          .get(entry.shell.environmentId)
          ?.get(entry.shell.session?.providerInstanceId ?? entry.shell.modelSelection.instanceId)}
        unread={
          !threadLastVisitedAtById[threadVisitedKey(entry.shell)] ||
          entry.shell.updatedAt > threadLastVisitedAtById[threadVisitedKey(entry.shell)]!
        }
        now={now}
        project={
          project ?? {
            environmentId: entry.shell.environmentId,
            title: "",
            workspaceRoot: "",
            faviconPath: null,
            projectIcon: null,
          }
        }
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
      <div className="@container/dashboard flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader
          electron={isElectron}
          className="h-auto min-h-12 flex-wrap border-b-0 py-2"
        >
          <WorkspaceBreadcrumb ariaLabel="Dashboard">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate text-base font-semibold">
                {scope
                  ? (spaceOptions.find((space) => space.key === effectiveSpaceFilter)?.name ??
                    (scope.unsorted ? "Unsorted" : activeProfile.name))
                  : "Dashboard"}
              </h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="no-drag ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                openWorkItem({
                  profileId:
                    selectedSpaceOwner?.id ??
                    (activeProfile.id === ALL_PROFILE_ID ? null : activeProfile.id),
                  spaceId: selectedSpace?.id ?? null,
                  ...(effectiveEnvironmentFilter
                    ? { environmentId: effectiveEnvironmentFilter }
                    : {}),
                  ...(projectByKey.get(effectiveProjectFilter)
                    ? { projectId: projectByKey.get(effectiveProjectFilter)!.id }
                    : {}),
                })
              }
            >
              New task
            </Button>
            {scope && (
              <Button size="xs" onClick={() => openChatCreation()}>
                New chat
              </Button>
            )}
            <Input
              size="compact"
              type="search"
              aria-label="Search dashboard"
              placeholder="Search tasks..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-40 min-w-0 rounded-md border-transparent bg-foreground/5 shadow-none sm:w-52"
            />
            <Button
              size="xs"
              variant="ghost"
              className="h-8 shrink-0 rounded-md bg-foreground/5 px-3 text-xs"
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
        <WorkspaceViews
          scope={{
            profileId: selectedSpaceOwner?.id ?? activeProfile.id,
            spaceId: selectedSpace?.id,
            unsorted: effectiveSpaceFilter === "root",
          }}
        />
        <div
          className="shrink-0 space-y-3 border-b border-border/60 px-4 pb-3 pt-1"
          aria-label="Dashboard controls"
        >
          <div className="grid gap-x-5 gap-y-3 @min-[900px]/dashboard:grid-cols-[2fr_3fr]">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[11px] font-medium text-foreground/80">Scope</legend>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Profile</div>
                  <Select
                    value={activeProfile.id}
                    onValueChange={(value) => {
                      if (value !== null) {
                        setScope(value, "all");
                        setEnvironmentFilter(null);
                        setProviderFilter("all");
                        setProjectFilter("all");
                      }
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 min-w-0 w-full sm:h-8 rounded-md border-sidebar-border bg-sidebar-row-active text-sidebar-foreground shadow-none"
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
                          className="min-h-8 text-xs sm:text-xs"
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
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Space</div>
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
                      className={cn(
                        "h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-muted/50 shadow-none",
                        effectiveSpaceFilter !== "all" &&
                          "bg-sidebar-row-active text-sidebar-foreground border-sidebar-border",
                      )}
                      aria-label="Filter dashboard by space"
                    >
                      <SelectValue>
                        {effectiveSpaceFilter === "all"
                          ? "All spaces"
                          : effectiveSpaceFilter === "root"
                            ? "Unsorted"
                            : spaceOptions.find((space) => space.key === effectiveSpaceFilter)
                                ?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      <SelectItem value="all" className="min-h-8 text-xs">
                        All spaces
                      </SelectItem>
                      <SelectItem value="root" className="min-h-8 text-xs">
                        Unsorted
                      </SelectItem>
                      {spaceOptions.map((space) => (
                        <SelectItem key={space.key} value={space.key} className="min-h-8 text-xs">
                          {space.name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[11px] font-medium text-foreground/80">
                Execution
              </legend>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Device</div>
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
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                      aria-label="Filter dashboard by device"
                    >
                      <SelectValue>
                        {effectiveEnvironmentFilter === null
                          ? "All devices"
                          : environmentByKind.get(effectiveEnvironmentFilter)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="all">
                        All devices
                      </SelectItem>
                      {profileEnvironments.map((environment) => (
                        <SelectItem
                          className="min-h-8 text-xs sm:text-xs"
                          key={environment.environmentId}
                          value={environment.environmentId}
                        >
                          {environment.label}
                          {environment.connection.phase !== "connected" ? " (offline)" : ""}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Provider</div>
                  <Select
                    value={effectiveProviderFilter}
                    onValueChange={(value) => {
                      setProviderFilter(value ?? "all");
                      setProjectFilter("all");
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
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
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="all">
                        All providers
                      </SelectItem>
                      {providerOptions.map(([key, provider]) => (
                        <SelectItem className="min-h-8 text-xs sm:text-xs" key={key} value={key}>
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
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Project</div>
                  <Select
                    value={effectiveProjectFilter}
                    onValueChange={(value) => setProjectFilter(value ?? "all")}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
                      aria-label="Filter dashboard by project"
                    >
                      <SelectValue>
                        {effectiveProjectFilter === "all"
                          ? "All projects"
                          : projectByKey.get(effectiveProjectFilter)?.title}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup
                      alignItemWithTrigger={false}
                      className="w-80 max-w-[calc(100vw-2rem)]"
                    >
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="all">
                        All projects
                      </SelectItem>
                      {projectOptions.map((project) => (
                        <SelectItem
                          className="min-h-8 text-xs sm:text-xs"
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
                                {environmentByKind.get(project.environmentId)?.label ??
                                  "Unknown device"}
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
                                    ? (PROVIDER_DISPLAY_NAMES[provider.driverKind] ??
                                      provider.driverKind)
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
              </div>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-border/40 pt-2">
            <fieldset className="min-w-0 flex-[2_1_17rem]">
              <legend className="mb-1.5 text-[11px] font-medium text-foreground/80">Git</legend>
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Branch</div>
                  <Input
                    size="compact"
                    className="h-8 w-full rounded-md bg-foreground/5 shadow-none"
                    list="dashboard-branches"
                    aria-label="Filter by branch"
                    placeholder="Any branch"
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
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Pull request</div>
                  <Select
                    value={prFilter}
                    onValueChange={(value) => {
                      if (value) setPrFilter(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
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
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="all">
                        Any PR
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="linked">
                        Linked PR
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="none">
                        No linked PR
                      </SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            </fieldset>
            <fieldset className="min-w-0 flex-[3_1_25rem]">
              <legend className="mb-1.5 text-[11px] font-medium text-foreground/80">View</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Status</div>
                  <Select
                    value={visibility}
                    onValueChange={(value) => {
                      if (value) setVisibility(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-sidebar-border bg-sidebar-row-active text-sidebar-foreground shadow-none"
                      aria-label="Task visibility"
                    >
                      <SelectValue>
                        <span className="capitalize">{visibility}</span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {(["active", "snoozed", "settled", "archived"] as const).map((value) => (
                        <SelectItem
                          className="min-h-8 text-xs sm:text-xs"
                          key={value}
                          value={value}
                        >
                          <span className="capitalize">{value}</span>
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Group by</div>
                  <Select
                    disabled={visibility !== "active"}
                    value={groupBy}
                    onValueChange={(value) => {
                      if (value) setGroupBy(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-transparent bg-foreground/5 shadow-none hover:bg-foreground/10"
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
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="state">
                        By state
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="project">
                        By project
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="space">
                        By space
                      </SelectItem>
                    </SelectPopup>
                  </Select>
                </div>{" "}
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] leading-4 text-muted-foreground">Results</div>
                  {resultsControl}
                </div>
              </div>
            </fieldset>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={!activeFilters.length}
                onClick={resetFilters}
              >
                Reset filters
              </Button>
              <DashboardSavedViews current={currentView} onApply={applyView} />
            </div>
          </div>
        </div>
        {activeFilters.length > 0 &&
        (visibility === "active" ? allEntries.length === 0 : history.length === 0) &&
        !(visibility === "archived" && (archive.isLoading || archive.error)) ? (
          <div
            role="status"
            className="mx-4 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
          >
            No tasks match these filters.
            <Button size="xs" variant="ghost" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
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
          <div
            className={cn(
              "grid min-h-0 flex-1 content-start items-start gap-3 overflow-y-auto p-4",
              groupBy === "state"
                ? "@min-[1120px]/dashboard:grid-cols-4"
                : "@min-[640px]/dashboard:grid-cols-2 @min-[1000px]/dashboard:grid-cols-3",
            )}
            aria-label="Task board"
            ref={boardRef}
          >
            <TaskShelf
              profileId={
                rawProfiles.find((owner) =>
                  (owner.spaces ?? []).some(
                    (space) => `${owner.id}:${space.id}` === effectiveSpaceFilter,
                  ),
                )?.id ?? activeProfile.id
              }
              environmentId={effectiveEnvironmentFilter}
              projectKey={effectiveProjectFilter}
              search={search}
              spaceId={
                effectiveSpaceFilter === "all"
                  ? undefined
                  : effectiveSpaceFilter === "root"
                    ? null
                    : rawProfiles
                        .flatMap((owner) =>
                          (owner.spaces ?? []).map((space) => ({
                            key: `${owner.id}:${space.id}`,
                            id: space.id,
                          })),
                        )
                        .find((space) => space.key === effectiveSpaceFilter)?.id
              }
              visibleThreadKeys={allEntries.map(
                (entry) => `${entry.shell.environmentId}:${entry.shell.id}`,
              )}
            />
            {groupBy === "state" ? (
              visibleLanes.map((lane) => {
                const entries = filteredBoard.lanes[lane];
                return (
                  <section
                    key={lane}
                    aria-label={LANE_TILE_LABELS[lane]}
                    className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-muted/15 p-3"
                  >
                    <div className="flex min-h-7 flex-wrap items-center gap-2">
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
                      <h2 className="text-[13px] font-semibold">
                        {lane === "done"
                          ? showRecent
                            ? "Recent results"
                            : "Ready to review"
                          : LANE_TILE_LABELS[lane]}
                      </h2>
                      <span className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {entries.length}
                      </span>
                    </div>
                    <div className="space-y-2 [&:not(:empty)]:mt-2">
                      {entries.length ? (
                        entries.map(renderCard)
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {activeFilters.length > 0
                            ? "No matching tasks"
                            : lane === "needs-you"
                              ? "Nothing needs attention"
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
            ) : groupBy === "space" && allEntries.length > 0 ? (
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
                    className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-muted/15 p-3"
                  >
                    <h2 className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-semibold">
                      {spaceOptions.find((space) => space.key === key)?.name ?? "Unsorted"}
                      <span className="text-muted-foreground">{entries.length}</span>
                    </h2>
                    <div className="space-y-2">{entries.map(renderCard)}</div>
                  </section>
                );
              })
            ) : projectGroups.length ? (
              projectGroups.map((group) => (
                <section
                  key={group.projectKey}
                  className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-muted/15 p-3"
                >
                  <h2 className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-semibold">
                    {projectByKey.get(group.projectKey)?.title ?? "Unknown project"}
                    <span className="text-muted-foreground">{group.entries.length}</span>
                  </h2>
                  <div className="space-y-2">{group.entries.map(renderCard)}</div>
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
