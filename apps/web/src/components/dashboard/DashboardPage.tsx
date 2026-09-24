import { captureDashboardFilters } from "../../lib/globalDashboardNavigation";
import { useOpenChatInColumns } from "../../hooks/useOpenChatInColumns";
import { useChatColumnLocation, type ColumnLocation } from "../../hooks/useChatColumnLocation";
import {
  CheckCheckIcon,
  ClockIcon,
  ClipboardListIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Sheet, SheetPopup, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { filterTaskShelfItems } from "../tasks/TaskShelf.logic";
import { useChatMode } from "../spaces/columnNavigation";
import { workItemChats } from "@t3tools/contracts";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { dashboardStorageScope } from "../../lib/globalDashboardNavigation";
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
import { useNavigate, useLocation } from "@tanstack/react-router";
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
  dashboardHistory,
  type DashboardHistoryView,
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
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";

import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Input } from "../ui/input";
import { ProfileDot } from "../sidebar/ProfileStrip";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { SidebarInset } from "../ui/sidebar";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "~/lib/utils";
import { isElectron } from "../../env";
import {
  useProjects,
  useThreadShells,
  useAllEnvironmentShellsBootstrapped,
} from "../../state/entities";
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
  type DashboardLane,
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
  idle: "Idle",
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
  const storageScope = dashboardStorageScope(scope);
  const shellsReady = useAllEnvironmentShellsBootstrapped();
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
  const location = useLocation();
  const [chatMode] = useChatMode();
  const columnLocation = useChatColumnLocation();
  const openInColumns = useOpenChatInColumns();
  const [openingChat, setOpeningChat] = useState<string | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const historyOpen = visibility !== "active" || taskHistoryOpen;
  function openHistory(view: "settled" | "snoozed" | "archived" | "tasks") {
    setTaskHistoryOpen(view === "tasks");
    setVisibility(view === "tasks" ? "active" : view);
    setHistoryQuery("");
  }
  function closeHistory() {
    setTaskHistoryOpen(false);
    setVisibility("active");
    setHistoryQuery("");
  }
  const [groupBy, setGroupBy] = useLocalStorage(
    `${storageScope}.group`,
    "state",
    DashboardGroupSchema,
  );
  const boardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node || !shellsReady) return;
    const scrollKey = `${storageScope}.${groupBy}.scroll`;
    let position = 0;
    try {
      position = getLocalStorageItem(scrollKey, Schema.Finite) ?? 0;
    } catch {
      // A stale scroll preference must not prevent opening the dashboard.
    }
    node.scrollTop = position;
    const scrollAreas = [...node.querySelectorAll<HTMLElement>("[data-dashboard-scroll]")];
    const positions = new Map<HTMLElement, { top: number; left: number }>();
    for (const area of scrollAreas) {
      const key = `${scrollKey}.${area.dataset.dashboardScroll}`;
      try {
        area.scrollTop = getLocalStorageItem(`${key}.top`, Schema.Finite) ?? 0;
        area.scrollLeft = getLocalStorageItem(`${key}.left`, Schema.Finite) ?? 0;
      } catch {
        /* Scroll remains available without storage. */
      }
      positions.set(area, { top: area.scrollTop, left: area.scrollLeft });
    }
    const track = () => {
      position = node.scrollTop;
      for (const area of scrollAreas)
        positions.set(area, { top: area.scrollTop, left: area.scrollLeft });
    };
    const save = () => {
      try {
        setLocalStorageItem(scrollKey, position, Schema.Finite);
        for (const [area, offset] of positions) {
          const key = `${scrollKey}.${area.dataset.dashboardScroll}`;
          setLocalStorageItem(`${key}.top`, offset.top, Schema.Finite);
          setLocalStorageItem(`${key}.left`, offset.left, Schema.Finite);
        }
      } catch {
        // Scrolling remains usable when browser storage is unavailable.
      }
    };
    node.addEventListener("scroll", track, { passive: true, capture: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      node.removeEventListener("scroll", track, true);
      window.removeEventListener("pagehide", save);
    };
  }, [storageScope, groupBy, shellsReady]);
  const { environments } = useEnvironments();

  const rawProfiles = usePrimarySettings((s) => s.profiles);
  const resolvedProfiles = useMemo(() => resolveProfiles(rawProfiles), [rawProfiles]);
  const activeProfileId = scope?.profileId ?? globalProfileId;
  function setScope(profileId: string | null, spaceKey: string) {
    if (
      scope &&
      chatMode === "columns" &&
      (scope.spaceId || scope.unsorted || (profileId ?? ALL_PROFILE_ID) !== scope.profileId)
    )
      return;
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
                ...archive.snapshots.flatMap(({ environmentId, snapshot }) =>
                  snapshot.projects.map((project) => ({ ...project, environmentId })),
                ),
                ...liveProjects,
              ].map((project) => [dashboardProjectKey(project.environmentId, project.id), project]),
            ).values(),
          ]
        : liveProjects,
    [visibility, liveProjects, archive.snapshots],
  );
  const allShells = useMemo(
    () =>
      visibility === "archived"
        ? [
            ...new Map(
              [
                ...archive.snapshots.flatMap(({ environmentId, snapshot }) =>
                  snapshot.threads.map((shell) => ({ ...shell, environmentId })),
                ),
                ...liveShells,
              ].map((shell) => [threadVisitedKey(shell), shell]),
            ).values(),
          ]
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
  const filteredBoard = useMemo(
    () => buildReviewDashboard(gitShells, now, reviewed),
    [gitShells, now, reviewed],
  );
  const settled = useMemo(() => dashboardHistory(gitShells, now, "settled"), [gitShells, now]);
  const snoozed = useMemo(() => dashboardHistory(gitShells, now, "snoozed"), [gitShells, now]);
  const history = useMemo(
    () => (visibility === "active" ? [] : dashboardHistory(gitShells, now, visibility)),
    [gitShells, now, visibility],
  );

  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const [detailedCards, setDetailedCards] = useLocalStorage(
    "t3.dashboard.detailedCards",
    false,
    Schema.Boolean,
  );
  const showMachineIcon = environments.length > 1;
  const environmentByKind = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );

  const allEntries = useMemo(() => flattenBoardEntries(filteredBoard), [filteredBoard]);
  const focusedReturn = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = location.state.dashboardFocusKey;
    if (!key || focusedReturn.current === key || !shellsReady || archive.isLoading) return;
    const card = (
      visibility === "active" ? boardRef.current : historyRef.current
    )?.querySelector<HTMLElement>(`[data-dashboard-chat-key="${CSS.escape(key)}"]`);
    if (card) {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: "nearest", inline: "nearest" });
      focusedReturn.current = key;
    } else {
      const moved = settled.some((shell) => threadVisitedKey(shell) === key)
        ? "settled"
        : snoozed.some((shell) => threadVisitedKey(shell) === key)
          ? "snoozed"
          : undefined;
      focusedReturn.current = key;
      toastManager.add({
        type: "info",
        title: moved ? `This chat is now ${moved}` : "This chat is outside the current view",
        description: "Your dashboard filters and scroll positions were kept.",
        timeout: 6000,
        ...(moved
          ? { actionProps: { children: `View ${moved}`, onClick: () => setVisibility(moved) } }
          : {}),
      });
    }
  }, [
    shellsReady,
    archive.isLoading,
    snoozed,
    location.state.dashboardFocusKey,
    allEntries,
    history,
    settled,
    visibility,
    taskHistoryOpen,
    setVisibility,
  ]);
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
    recent: false,
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
  function renderHistoryRow(shell: EnvironmentThreadShell, view: DashboardHistoryView) {
    const project = projectByKey.get(dashboardProjectKey(shell.environmentId, shell.projectId));
    const environment = environmentByKind.get(shell.environmentId);
    return (
      <DashboardHistoryRow
        key={threadVisitedKey(shell)}
        shell={shell}
        onOpen={() => void openDashboardChat(shell)}
        opening={openingChat === threadVisitedKey(shell)}
        spaceName={shellSpace(shell)?.name}
        view={view}
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
          const result = await (view === "archived"
            ? unarchiveThread(target)
            : view === "settled"
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
  }

  async function openDashboardChat(shell: EnvironmentThreadShell, destination?: ColumnLocation) {
    if (opening.current) return;
    opening.current = true;
    const key = threadVisitedKey(shell);
    setOpeningChat(key);
    const dashboardReturn = {
      href: location.href,
      snapshot: {
        storageScope,
        group: groupBy,
        filters: captureDashboardFilters(storageScope),
        detailed: detailedCards,
        scroll: Object.fromEntries([
          ["root", { top: boardRef.current?.scrollTop ?? 0, left: 0 }],
          ...[
            ...(boardRef.current?.querySelectorAll<HTMLElement>("[data-dashboard-scroll]") ?? []),
          ].map((area) => [
            area.dataset.dashboardScroll!,
            { top: area.scrollTop, left: area.scrollLeft },
          ]),
        ]),
      },
      threadKey: key,
      label: scope
        ? `${scope.unsorted ? "Unsorted" : (selectedSpace?.name ?? activeProfile.name)} overview`
        : "Global dashboard",
    };
    try {
      if (!mounted.current) return;
      useWorkflowState.setState({
        triageProfileId: activeProfile.id,
        triageSpaceId: scope?.spaceId,
        triageUnsorted: scope?.unsorted,
        triageScoped: !!scope,
        triageQueue: allEntries
          .filter((item) => item.lane === "needs-you" || item.lane === "done")
          .map((item) => threadVisitedKey(item.shell)),
      });
      if (chatMode === "columns") {
        await openInColumns(shell, { dashboardReturn, ...(destination ? { destination } : {}) });
      } else {
        await navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: shell.environmentId, threadId: shell.id },
          state: { dashboardReturn },
        });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open this chat",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      opening.current = false;
      if (mounted.current) setOpeningChat(null);
    }
  }

  function renderCard(entry: DashboardBoardEntry) {
    const project = projectByKey.get(
      dashboardProjectKey(entry.shell.environmentId, entry.shell.projectId),
    );
    const machineKind = resolveEnvironmentMachineKind(
      environmentByKind.get(entry.shell.environmentId)?.serverConfig ?? null,
    );
    return (
      <DashboardCard
        columnLocation={
          chatMode === "columns"
            ? columnLocation({
                environmentId: entry.shell.environmentId,
                threadId: entry.shell.id,
                projectId: entry.shell.projectId,
              })
            : undefined
        }
        key={`${entry.shell.environmentId}:${entry.shell.id}`}
        entry={entry}
        detailed={detailedCards}
        tasks={workItems.filter(
          (task) =>
            !task.item.deletedAt &&
            task.item.status === "working" &&
            workItemChats(task.item, task.environmentId).some(
              (chat) =>
                chat.environmentId === entry.shell.environmentId &&
                chat.threadId === entry.shell.id,
            ),
        )}
        onOpen={() => void openDashboardChat(entry.shell)}
        onOpenIn={(destination) => void openDashboardChat(entry.shell, destination)}
        opening={openingChat === threadVisitedKey(entry.shell)}
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

  const captureTask = () =>
    openWorkItem({
      profileId:
        selectedSpaceOwner?.id ?? (activeProfile.id === ALL_PROFILE_ID ? null : activeProfile.id),
      spaceId: selectedSpace?.id ?? null,
      ...(effectiveEnvironmentFilter ? { environmentId: effectiveEnvironmentFilter } : {}),
      ...(projectByKey.get(effectiveProjectFilter)
        ? { projectId: projectByKey.get(effectiveProjectFilter)!.id }
        : {}),
    });

  const taskScope = {
    profileId:
      rawProfiles.find((owner) =>
        (owner.spaces ?? []).some((space) => `${owner.id}:${space.id}` === effectiveSpaceFilter),
      )?.id ?? activeProfile.id,
    spaceId:
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
              .find((space) => space.key === effectiveSpaceFilter)?.id,
    environmentId: effectiveEnvironmentFilter,
    projectKey: effectiveProjectFilter,
    search,
  };
  const taskHistoryCount = filterTaskShelfItems(workItems, taskScope).filter(
    ({ item }) => !item.deletedAt && (item.status === "working" || item.status === "done"),
  ).length;
  const renderTasks = (section: "planned" | "history") => (
    <TaskShelf section={section} {...taskScope} query={section === "history" ? historyQuery : ""} />
  );
  const historyMatches = history.filter(
    (shell) =>
      !historyQuery.trim() ||
      [
        shell.title,
        shell.branch,
        shellSpace(shell)?.name,
        projectByKey.get(dashboardProjectKey(shell.environmentId, shell.projectId))?.title,
        environmentByKind.get(shell.environmentId)?.label,
      ].some((value) => value?.toLowerCase().includes(historyQuery.trim().toLowerCase())),
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="@container/dashboard flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background [&_[data-filter-active=true]]:border-primary/45 [&_[data-filter-active=true]]:bg-primary/10 [&_[data-filter-active=true]]:ring-1 [&_[data-filter-active=true]]:ring-primary/15">
        <WorkspacePageHeader
          electron={isElectron}
          className="h-auto min-h-[var(--workspace-topbar-height)] flex-wrap py-2"
        >
          <div className="flex min-w-0 items-center gap-4">
            {chatMode === "columns" && scope ? (
              <WorkspaceViews embedded scope={scope} />
            ) : (
              <WorkspaceBreadcrumb ariaLabel="Dashboard">
                <WorkspaceBreadcrumbItem current>
                  {scope && (selectedSpace || scope.unsorted) && (
                    <span className="mr-2 max-w-48 truncate text-sm font-normal text-muted-foreground">
                      {selectedSpaceOwner?.name ?? activeProfile.name} /
                    </span>
                  )}
                  <h1 className="truncate text-base font-semibold">
                    {scope
                      ? (spaceOptions.find((space) => space.key === effectiveSpaceFilter)?.name ??
                        (scope.unsorted ? "Unsorted" : activeProfile.name))
                      : "Dashboard"}
                  </h1>
                </WorkspaceBreadcrumbItem>
              </WorkspaceBreadcrumb>
            )}
            {!(chatMode === "columns" && scope) && (
              <WorkspaceViews
                navigationOnly
                scope={{
                  profileId: selectedSpaceOwner?.id ?? activeProfile.id,
                  spaceId: selectedSpace?.id,
                  unsorted: effectiveSpaceFilter === "root",
                }}
              />
            )}
          </div>
          <div className="no-drag flex min-w-48 flex-1 justify-center px-2">
            <div className="relative w-full max-w-md">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                size="compact"
                type="search"
                aria-label="Search dashboard"
                data-filter-active={search.trim().length > 0}
                placeholder="Search tasks and chats"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 w-full rounded-lg border-border/60 bg-muted/30 pl-9 shadow-none"
              />
            </div>
          </div>
          <div className="no-drag flex flex-wrap items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              className="h-8 shrink-0 rounded-md px-3 text-xs"
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
              <PullRequestGlyph.pullRequest className="size-3.5" />
              Pull requests
            </Button>
          </div>
          <div
            role="group"
            aria-label="Create work"
            className="no-drag flex shrink-0 items-center gap-2 border-l border-border/60 pl-3"
          >
            <Button size="sm" variant="outline" onClick={captureTask}>
              <ClipboardListIcon className="size-3.5" />
              New task
            </Button>
            <Button size="sm" onClick={() => openChatCreation()}>
              <PlusIcon className="size-3.5" />
              New chat
            </Button>
          </div>
        </WorkspacePageHeader>
        <div
          className="shrink-0 border-b border-border/60 px-4 py-2"
          aria-label="Dashboard controls"
        >
          <div className="grid max-w-[55rem] grid-cols-1 items-end gap-x-5 gap-y-2 @min-[52rem]/dashboard:grid-cols-[20.5rem_minmax(0,1fr)]">
            <fieldset className="min-w-0">
              <legend className="mb-1 text-[10px] font-medium text-muted-foreground">Scope</legend>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <div className="sr-only">Profile</div>
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
                      className="h-8 min-w-0 w-full sm:h-8 rounded-md border-border/70 bg-background shadow-none"
                      disabled={chatMode === "columns" && !!scope}
                      aria-label="Filter dashboard by profile"
                      data-filter-active={activeProfile.id !== ALL_PROFILE_ID}
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
                </div>
                <div className="min-w-0">
                  <div className="sr-only">Space</div>
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
                        "h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none",
                        effectiveSpaceFilter !== "all" && "border-primary/35",
                      )}
                      disabled={
                        chatMode === "columns" && !!scope && (!!scope.spaceId || scope.unsorted)
                      }
                      aria-label="Filter dashboard by space"
                      data-filter-active={effectiveSpaceFilter !== "all"}
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
            <fieldset className="min-w-0 @min-[52rem]/dashboard:border-l @min-[52rem]/dashboard:border-border/60 @min-[52rem]/dashboard:pl-4">
              <legend className="mb-1 text-[10px] font-medium text-muted-foreground">
                Environment
              </legend>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <div className="sr-only">Device</div>
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
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none hover:bg-foreground/10"
                      aria-label="Filter dashboard by device"
                      data-filter-active={!!effectiveEnvironmentFilter}
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
                </div>
                <div className="min-w-0">
                  <div className="sr-only">Folder</div>
                  <Select
                    value={effectiveProjectFilter}
                    onValueChange={(value) => setProjectFilter(value ?? "all")}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none hover:bg-foreground/10"
                      aria-label="Filter dashboard by folder"
                      data-filter-active={effectiveProjectFilter !== "all"}
                    >
                      <SelectValue>
                        {effectiveProjectFilter === "all"
                          ? "All folders"
                          : projectByKey.get(effectiveProjectFilter)?.title}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup
                      alignItemWithTrigger={false}
                      className="w-80 max-w-[calc(100vw-2rem)]"
                    >
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="all">
                        All folders
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
                <div className="min-w-0">
                  <div className="sr-only">Provider</div>
                  <Select
                    value={effectiveProviderFilter}
                    onValueChange={(value) => {
                      setProviderFilter(value ?? "all");
                      setProjectFilter("all");
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none hover:bg-foreground/10"
                      aria-label="Filter dashboard by provider"
                      data-filter-active={effectiveProviderFilter !== "all"}
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
                </div>
              </div>
            </fieldset>
          </div>
          <div className="mt-2 grid max-w-[55rem] grid-cols-1 items-end gap-x-5 gap-y-2 @min-[52rem]/dashboard:grid-cols-[20.5rem_minmax(0,1fr)]">
            <fieldset className="min-w-0">
              <legend className="mb-1 text-[10px] font-medium text-muted-foreground">Git</legend>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <div className="sr-only">Branch</div>
                  <Input
                    size="compact"
                    className="h-8 w-full rounded-md bg-background shadow-none"
                    list="dashboard-branches"
                    aria-label="Filter by branch"
                    data-filter-active={branchFilter.trim().length > 0}
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
                </div>
                <div className="min-w-0">
                  <div className="sr-only">Pull request</div>
                  <Select
                    value={prFilter}
                    onValueChange={(value) => {
                      if (value) setPrFilter(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full sm:h-8 rounded-md border-border/70 bg-background shadow-none hover:bg-foreground/10"
                      aria-label="Filter by linked PR"
                      data-filter-active={prFilter !== "all"}
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
            <fieldset className="min-w-0 @min-[52rem]/dashboard:border-l @min-[52rem]/dashboard:border-border/60 @min-[52rem]/dashboard:pl-4">
              <legend className="mb-1 text-[10px] font-medium text-muted-foreground">
                Display
              </legend>
              <div className="grid grid-cols-3 items-center gap-2">
                <div className="min-w-0">
                  <div className="sr-only">Status</div>
                  <Select
                    value={visibility}
                    onValueChange={(value) => {
                      if (value === "active") closeHistory();
                      else if (value) openHistory(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none"
                      aria-label="Task visibility"
                      data-filter-active={visibility !== "active"}
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
                </div>
                <div className="min-w-0">
                  <div className="sr-only">Group by</div>
                  <Select
                    value={groupBy}
                    onValueChange={(value) => {
                      if (value) setGroupBy(value);
                    }}
                  >
                    <SelectTrigger
                      size="xs"
                      className="h-8 w-full min-w-0 sm:h-8 rounded-md border-border/70 bg-background shadow-none hover:bg-foreground/10"
                      aria-label="Group chats"
                      data-filter-active={groupBy !== "state"}
                    >
                      <SelectValue>
                        {groupBy === "state"
                          ? "By state"
                          : groupBy === "space"
                            ? "By space"
                            : "By folder"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="state">
                        By state
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="project">
                        By folder
                      </SelectItem>
                      <SelectItem className="min-h-8 text-xs sm:text-xs" value="space">
                        By space
                      </SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
                <div className="flex h-8 items-center gap-1">
                  <DashboardSavedViews current={currentView} onApply={applyView} />
                  <Button
                    size="xs"
                    variant="ghost-muted"
                    disabled={!activeFilters.length}
                    onClick={resetFilters}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </fieldset>
          </div>
          {activeFilters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Applied filters">
              {activeFilters.map((filter) => (
                <Button
                  key={filter.label}
                  size="micro"
                  variant="outline"
                  onClick={filter.clear}
                  aria-label={`Remove ${filter.label}`}
                  className="max-w-64"
                >
                  <span className="truncate">{filter.label}</span>
                  <XIcon className="size-3 shrink-0" />
                </Button>
              ))}
            </div>
          )}
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 pb-3 pt-2"
          aria-label="Task board"
          ref={(node) => {
            boardRef.current = node;
          }}
        >
          {renderTasks("planned")}
          <div className="col-span-full flex flex-wrap items-center gap-3 pt-1">
            <h2 className="text-sm font-medium">Chat activity</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{allEntries.length}</span>
            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost-muted" onClick={() => openHistory("settled")}>
                <CheckCheckIcon className="size-3.5" />
                Settled <span className="tabular-nums">{settled.length}</span>
              </Button>
              <Button size="xs" variant="ghost-muted" onClick={() => openHistory("snoozed")}>
                <ClockIcon className="size-3.5" />
                Snoozed <span className="tabular-nums">{snoozed.length}</span>
              </Button>
              <Button size="xs" variant="ghost-muted" onClick={() => openHistory("tasks")}>
                <ClipboardListIcon className="size-3.5" />
                Task history <span className="tabular-nums">{taskHistoryCount}</span>
              </Button>
            </div>
            <div
              className="ml-auto flex items-center rounded-md border border-border/70 p-0.5"
              role="group"
              aria-label="Card detail"
            >
              <Button
                size="micro"
                variant={!detailedCards ? "secondary" : "ghost-muted"}
                aria-pressed={!detailedCards}
                onClick={() => setDetailedCards(false)}
              >
                Compact
              </Button>
              <Button
                size="micro"
                variant={detailedCards ? "secondary" : "ghost-muted"}
                aria-pressed={detailedCards}
                onClick={() => setDetailedCards(true)}
              >
                Detailed
              </Button>
            </div>
          </div>
          <div
            data-dashboard-scroll={groupBy === "state" ? undefined : `group-${groupBy}`}
            className={cn(
              "min-h-0 flex-1",
              groupBy !== "state" &&
                "grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] items-start gap-3 overflow-y-auto",
            )}
          >
            {groupBy === "state" ? (
              <div
                className="h-full min-w-0 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]"
                data-dashboard-scroll="board"
                aria-label="Chat status columns"
                tabIndex={0}
              >
                <div className="grid h-full auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-2">
                  {visibleLanes.map((lane) => {
                    const entries = filteredBoard.lanes[lane];
                    return (
                      <section
                        key={lane}
                        aria-label={LANE_TILE_LABELS[lane]}
                        className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border/60 bg-muted/20"
                      >
                        <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              lane === "needs-you"
                                ? "bg-amber-500"
                                : lane === "running"
                                  ? "bg-sky-500"
                                  : lane === "monitoring"
                                    ? "bg-violet-500"
                                    : lane === "idle"
                                      ? "bg-muted-foreground/50"
                                      : "bg-emerald-500",
                            )}
                          />
                          <h2 className="text-[13px] font-semibold">{LANE_TILE_LABELS[lane]}</h2>
                          <span className="rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                            {entries.length}
                          </span>
                        </div>
                        <div
                          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable] [scrollbar-width:thin]"
                          data-dashboard-scroll={lane}
                          tabIndex={0}
                          aria-label={`${LANE_TILE_LABELS[lane]} chats`}
                        >
                          {entries.map(renderCard)}
                          {!entries.length && (
                            <p className="px-1 py-3 text-xs text-muted-foreground">
                              {activeFilters.length ? "No matches" : "No chats"}
                            </p>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
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
                    className="flex min-w-0 flex-col rounded-lg border border-border/60 bg-muted/10 p-2.5"
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
                  className="flex min-w-0 flex-col rounded-lg border border-border/60 bg-muted/10 p-2.5"
                >
                  <h2 className="mb-2 flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-semibold">
                    {projectByKey.get(group.projectKey)?.title ?? "Unknown project"}
                    <span className="text-muted-foreground">{group.entries.length}</span>
                  </h2>
                  <div className="space-y-2">{group.entries.map(renderCard)}</div>
                </section>
              ))
            ) : (
              <p className="p-3 text-xs text-muted-foreground">No chats match this view.</p>
            )}
          </div>
        </div>
        <Sheet
          open={historyOpen}
          onOpenChange={(open) => {
            if (!open) closeHistory();
          }}
        >
          <SheetPopup
            side="right"
            className="w-[min(36rem,calc(100vw-2rem))] max-w-none"
            backdropClassName="bg-black/10 backdrop-blur-none"
          >
            <SheetHeader className="gap-2 border-b border-border/60 px-4 pb-3 pt-4 pr-12">
              <SheetTitle className="sr-only">
                {taskHistoryOpen
                  ? "Task history"
                  : visibility === "snoozed"
                    ? "Snoozed chats"
                    : visibility === "archived"
                      ? "Archived chats"
                      : "Settled chats"}
              </SheetTitle>
              <Select
                value={taskHistoryOpen ? "tasks" : visibility}
                onValueChange={(value) => {
                  if (
                    value === "settled" ||
                    value === "snoozed" ||
                    value === "tasks" ||
                    value === "archived"
                  )
                    openHistory(value);
                }}
              >
                <SelectTrigger
                  aria-label="History category"
                  className="h-8 w-fit gap-3 border-0 bg-transparent px-0 text-base font-semibold shadow-none"
                >
                  <SelectValue>
                    {taskHistoryOpen
                      ? "Task history"
                      : visibility === "snoozed"
                        ? "Snoozed chats"
                        : visibility === "archived"
                          ? "Archived chats"
                          : "Settled chats"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  <SelectItem value="settled">Settled chats</SelectItem>
                  <SelectItem value="snoozed">Snoozed chats</SelectItem>
                  <SelectItem value="tasks">Task history</SelectItem>
                  <SelectItem value="archived">Archived chats</SelectItem>
                </SelectPopup>
              </Select>
              <SheetDescription className="truncate text-xs">
                {activeProfile.id === ALL_PROFILE_ID ? "All profiles" : activeProfile.name} /{" "}
                {effectiveSpaceFilter === "all"
                  ? "All spaces"
                  : effectiveSpaceFilter === "root"
                    ? "Unsorted"
                    : (selectedSpace?.name ??
                      spaceOptions.find((space) => space.key === effectiveSpaceFilter)?.name)}
              </SheetDescription>
            </SheetHeader>
            <div className="shrink-0 space-y-3 border-b border-border/60 p-4">
              <Input
                size="compact"
                type="search"
                aria-label="Search history"
                placeholder="Search this history"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
              />
              {activeFilters.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Dashboard filters apply: {activeFilters.map((filter) => filter.label).join(" · ")}
                </p>
              )}
            </div>
            <div
              ref={historyRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]"
              aria-label="History results"
            >
              {taskHistoryOpen
                ? renderTasks("history")
                : visibility !== "active" && (
                    <>
                      {visibility === "archived" && archive.error && (
                        <div role="alert" className="text-xs text-destructive">
                          {archive.error}
                          <Button size="xs" variant="outline" onClick={archive.refresh}>
                            Retry
                          </Button>
                        </div>
                      )}
                      {visibility === "archived" && archive.isLoading && (
                        <p className="p-3 text-xs text-muted-foreground">
                          Loading archived chats...
                        </p>
                      )}
                      <ul>{historyMatches.map((shell) => renderHistoryRow(shell, visibility))}</ul>
                      {!historyMatches.length &&
                        !(visibility === "archived" && (archive.isLoading || archive.error)) && (
                          <p className="p-3 text-xs text-muted-foreground">
                            No {visibility} chats match this view.
                          </p>
                        )}
                    </>
                  )}
            </div>
          </SheetPopup>
        </Sheet>
      </div>
    </SidebarInset>
  );
}
