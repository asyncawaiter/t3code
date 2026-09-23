import { DashboardPage } from "../components/dashboard/DashboardPage";
import { WorkspaceViews } from "../components/spaces/WorkspaceViews";
import { workspaceView } from "../components/spaces/workspaceView";
import { ALL_PROFILE } from "@t3tools/contracts";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { GitBranchIcon, PlusIcon } from "lucide-react";
import { ALL_PROFILE_ID } from "@t3tools/contracts";
import { spaceOverviewThreads } from "../components/sidebar/Spaces.logic";
import { usePrimarySettings } from "../hooks/useSettings";
import { useProjects, useThreadShells } from "../state/entities";
import { selectSidebarSpace, useUiStateStore } from "../uiStateStore";
import { OUTSIDE_SPACES, spaceProjectKeys } from "../components/sidebar/Spaces.logic";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { checkoutPath } from "../components/spaces/SpaceFolder.logic";
import { SpaceFolder } from "../components/spaces/SpaceFolder";
import { Button } from "../components/ui/button";
import { openChatCreation } from "../chatCreationStore";
import { isElectron } from "../env";
import { useEnvironments } from "../state/environments";
import { ProjectFavicon } from "../components/ProjectFavicon";
const ChatColumns = lazy(() => import("../components/spaces/ChatColumns"));
const SpaceBranches = lazy(() => import("../components/spaces/SpaceBranches"));

export const Route = createFileRoute("/_chat/spaces/$profileId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    space: string | undefined;
    unsorted: boolean;
    view?: "branches" | "columns" | "folders" | undefined;
    folder?: string | undefined;
    focus?: string | undefined;
    workspace?: "space" | "board" | undefined;
    board?: string | undefined;
  } => ({
    space: typeof search.space === "string" ? search.space : undefined,
    unsorted: search.unsorted === true,
    view: workspaceView(search.view),
    workspace:
      search.workspace === "space" || search.workspace === "board" ? search.workspace : undefined,
    board: typeof search.board === "string" ? search.board : undefined,
    focus: typeof search.focus === "string" ? search.focus : undefined,
    folder: typeof search.folder === "string" ? search.folder : undefined,
  }),
  component: SpaceOverview,
});

function SpaceOverview() {
  const { profileId } = Route.useParams();
  const activation = useLocation({ select: (location) => location.state.overviewActivation });
  const {
    space: spaceId,
    unsorted,
    view,
    folder: folderKey,
    focus,
    workspace,
    board,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { environments } = useEnvironments();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const profile =
    profileId === ALL_PROFILE_ID ? ALL_PROFILE : profiles.find((item) => item.id === profileId);
  const space = profile?.spaces?.find((item) => item.id === spaceId);
  const filter = unsorted ? OUTSIDE_SPACES : (spaceId ?? null);
  const threads = useThreadShells();
  const projects = useProjects();
  useEffect(() => {
    if (view === "columns" && workspace !== "space" && profileId === "all") return;
    useUiStateStore.getState().setActiveProfileId(profileId === ALL_PROFILE_ID ? null : profileId);
    useUiStateStore.setState((state) => selectSidebarSpace(state, profileId, filter));
  }, [profileId, filter, view, workspace]);

  const spaceColumns =
    view === "columns" && (workspace === "space" || (workspace !== "board" && profileId !== "all"));
  const missing = (view !== "columns" || spaceColumns) && (!profile || (!!spaceId && !space));
  const chats =
    profileId === ALL_PROFILE_ID
      ? threads.filter(
          (thread) =>
            !thread.archivedAt &&
            (!unsorted ||
              !profiles.some((owner) =>
                owner.projectKeys.includes(`${thread.environmentId}:${thread.projectId}`),
              )),
        )
      : spaceOverviewThreads(profiles, profileId, filter, threads);
  const projectKeys = new Set(
    space
      ? spaceProjectKeys(space)
      : chats.map((chat) => `${chat.environmentId}:${chat.projectId}`),
  );
  const associatedProjects = projects.filter((project) =>
    projectKeys.has(`${project.environmentId}:${project.id}`),
  );
  const spaceProjects = [
    ...new Map(
      associatedProjects.map((folder) => [
        `${folder.environmentId}:${checkoutPath(folder.workspaceRoot)}`,
        folder,
      ]),
    ).values(),
  ];
  const selectedFolder =
    spaceProjects.find((folder) => `${folder.environmentId}:${folder.id}` === folderKey) ??
    spaceProjects[0];
  const openView = (nextView: "branches" | "columns" | "folders" | undefined, key = folderKey) =>
    void navigate({
      search: { space: spaceId, unsorted, view: nextView, folder: key },
      replace: true,
    });
  const missingFolders = [...projectKeys].filter(
    (key) => !associatedProjects.some((folder) => `${folder.environmentId}:${folder.id}` === key),
  );
  const title = missing
    ? "Space unavailable"
    : unsorted
      ? "Unsorted"
      : (space?.name ?? profile?.name ?? "All chats");

  if (!missing && !view) {
    return (
      <DashboardPage
        key={`${profileId}:${filter}:${activation ?? ""}`}
        scope={{ profileId, spaceId, unsorted }}
      />
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border/60">
        <WorkspaceViews embedded />
      </WorkspacePageHeader>
      <main
        className={`flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 ${view === "branches" || view === "columns" ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        <div
          className={`mx-auto flex w-full flex-col gap-3 ${view === "branches" || view === "columns" ? "min-h-0 flex-1" : "max-w-5xl"}`}
        >
          {(missing || view === "folders" || view === "branches") && (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="break-words text-xl font-semibold tracking-tight">{title}</h1>
                {(missing || unsorted) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {missing
                      ? "This space may have been removed. Choose another space in the sidebar."
                      : "Chats that have not been assigned to a space."}
                  </p>
                )}
              </div>
              {!missing && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => openChatCreation()}>
                    <PlusIcon className="size-4" />
                    New chat
                  </Button>
                </div>
              )}
            </div>
          )}
          {!missing && view === "branches" && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {view === "branches" ? (
                  <>
                    <GitBranchIcon className="size-3.5" /> Branches
                  </>
                ) : (
                  "Folders"
                )}
              </span>
              {view === "branches" && selectedFolder && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ProjectFavicon project={selectedFolder} className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <select
                      aria-label="Folder and device"
                      value={`${selectedFolder.environmentId}:${selectedFolder.id}`}
                      onChange={(event) => openView("branches", event.target.value)}
                      className="max-w-full rounded border-0 bg-transparent text-xs font-medium focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {spaceProjects.map((folder) => (
                        <option
                          key={`${folder.environmentId}:${folder.id}`}
                          value={`${folder.environmentId}:${folder.id}`}
                        >
                          {folder.title} ·{" "}
                          {environments.find(
                            (device) => device.environmentId === folder.environmentId,
                          )?.label ?? "Device unavailable"}{" "}
                          · {folder.workspaceRoot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          {!missing && view === "columns" ? (
            <Suspense fallback={<p>Loading chats...</p>}>
              <ChatColumns
                allChats={threads}
                focus={focus}
                boardId={board}
                scope={spaceColumns ? { profileId, spaceId, unsorted } : undefined}
              />
            </Suspense>
          ) : !missing && view === "branches" && selectedFolder ? (
            <Suspense
              fallback={<p className="text-xs text-muted-foreground">Loading branches...</p>}
            >
              <SpaceBranches
                key={`${selectedFolder.environmentId}:${selectedFolder.id}`}
                folder={selectedFolder}
                projects={projects}
                allChats={threads}
                spaceChats={chats}
              />
            </Suspense>
          ) : (
            !missing && (
              <div className="space-y-3">
                {spaceProjects.length ? (
                  spaceProjects.map((folder) => (
                    <SpaceFolder
                      key={`${folder.environmentId}:${folder.id}`}
                      folder={folder}
                      onOpenBranches={() =>
                        openView("branches", `${folder.environmentId}:${folder.id}`)
                      }
                      spaceChats={chats}
                      allChats={threads}
                      projects={projects}
                    />
                  ))
                ) : missingFolders.length ? null : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No folders are associated with this space yet. Choose a folder when starting a
                    chat.
                  </p>
                )}
                {missingFolders.map((key) => (
                  <p
                    key={key}
                    className="rounded-xl border border-border p-5 text-sm text-muted-foreground"
                  >
                    An associated folder is unavailable. Reconnect its device to restore its
                    details.
                    <span className="mt-1 block break-all font-mono text-xs">{key}</span>
                  </p>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </SidebarInset>
  );
}
