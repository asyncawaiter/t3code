import { useOpenChatInColumns } from "../hooks/useOpenChatInColumns";
import { useChatMode } from "./spaces/columnNavigation";
import { spaceDeviceDefaults } from "@t3tools/contracts";
import { spaceProjectKeys } from "./sidebar/Spaces.logic";
import type { ModelFavorite } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { modelFavoriteUnavailable } from "../modelFavorites";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { serverEnvironment } from "../state/server";
import { FavoriteSetupPicker } from "./FavoriteSetupPicker";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ALL_PROFILE_ID, moveThreadsToSpace, spaceForThread } from "@t3tools/contracts";
import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  useChatCreationStore,
  revealChatLocation,
  type ChatCreationRequest,
} from "../chatCreationStore";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { usePrimarySettings, useClientSettings } from "../hooks/useSettings";
import {
  useResolveChatProject,
  useSaveProfiles,
  type ChatLocation,
} from "../hooks/useChatCreation";
import { hasExplicitComposerModelSelection } from "../lib/chatThreadActions";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { useEnvironments } from "../state/environments";
import { useProjects, readProjects } from "../state/entities";
import { useUiStateStore } from "../uiStateStore";
import { ProjectLocationPicker } from "./ProjectLocationPicker";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "./ui/select";

export function ChatCreationDialog() {
  const request = useChatCreationStore((state) => state.request);
  return request ? <ChatCreationForm request={request} /> : null;
}

function ChatCreationForm({ request }: { request: ChatCreationRequest }) {
  const navigate = useNavigate();
  const [chatMode] = useChatMode();
  const openInColumns = useOpenChatInColumns("create");
  const projects = useProjects();
  const { environments } = useEnvironments();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const { activeThread, activeDraftThread, profileProjects, handleNewThread } =
    useHandleNewThread();
  const ui = useUiStateStore((state) => state);
  const session = useComposerDraftStore((state) =>
    request.draftId ? (state.draftThreadsByThreadKey[request.draftId] ?? null) : null,
  );
  const current = session ?? activeDraftThread ?? activeThread;
  const preferred =
    request.projectRef ??
    (current ? scopeProjectRef(current.environmentId, current.projectId) : null);
  const initialProject =
    projects.find(
      (project) =>
        preferred?.projectId === project.id &&
        preferred.environmentId === project.environmentId &&
        (request.draftId || profileProjects.includes(project)),
    ) ?? profileProjects[0];
  const initialKey = initialProject
    ? scopedProjectKey(scopeProjectRef(initialProject.environmentId, initialProject.id))
    : null;
  const initialProfileId =
    request.scope?.profileId ??
    (session
      ? profiles.find((profile) => initialKey && profile.projectKeys.includes(initialKey))?.id
      : ui.activeProfileId) ??
    ALL_PROFILE_ID;
  const initialProfile = profiles.find((profile) => profile.id === initialProfileId);
  const initialSpace = request.scope
    ? request.scope.spaceId
    : session && initialKey && initialProfile
      ? spaceForThread(
          initialProfile,
          scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId)),
          initialKey,
        )?.id
      : initialProfile?.spaces?.find(
          (space) =>
            ui.spaceSelection?.profileId === initialProfile.id &&
            ui.spaceSelection.filter === space.id,
        )?.id;
  const initialSelectedSpace = initialProfile?.spaces?.find((space) => space.id === initialSpace);
  const initialSpaceKeys = initialSelectedSpace ? spaceProjectKeys(initialSelectedSpace) : null;
  const initialDefaults = initialSelectedSpace ? spaceDeviceDefaults(initialSelectedSpace) : {};
  const initialDefaultKey =
    (initialProject ? initialDefaults[initialProject.environmentId] : undefined)?.projectKey ??
    Object.values(initialDefaults)[0]?.projectKey;
  const initialLocationProject = request.draftId
    ? initialProject
    : initialSpaceKeys
      ? (projects.find(
          (project) => `${project.environmentId}:${project.id}` === initialDefaultKey,
        ) ??
        projects.find((project) =>
          initialSpaceKeys.includes(`${project.environmentId}:${project.id}`),
        ))
      : initialProject;
  const [profileId, setProfileId] = useState(initialProfileId);
  const [spaceId, setSpaceId] = useState<string | null>(initialSpace ?? null);
  const [location, setLocation] = useState<ChatLocation | null>(
    initialLocationProject
      ? {
          environmentId: initialLocationProject.environmentId,
          workspaceRoot: initialLocationProject.workspaceRoot,
        }
      : null,
  );
  const locationAvailable = environments.some(
    (environment) =>
      environment.environmentId === location?.environmentId &&
      environment.connection.phase === "connected",
  );
  const [favorite, setFavorite] = useState<ModelFavorite | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  const boardDraft = useRef<{
    locationKey: string;
    opened: NonNullable<Awaited<ReturnType<typeof handleNewThread>>>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolveProject = useResolveChatProject();
  const saveProfiles = useSaveProfiles();
  const grouping = useClientSettings(selectProjectGroupingSettings);
  const profile = profiles.find((item) => item.id === profileId);
  const selectedSpace = profile?.spaces?.find((space) => space.id === spaceId);
  const spaceKeys = selectedSpace ? spaceProjectKeys(selectedSpace) : null;
  const suggestedProjects = spaceKeys
    ? projects.filter((project) => spaceKeys.includes(`${project.environmentId}:${project.id}`))
    : undefined;
  const changeScope = (nextProfileId: string, nextSpaceId: string | null) => {
    const nextProfile = profiles.find((item) => item.id === nextProfileId);
    const nextSpace = nextProfile?.spaces?.find((item) => item.id === nextSpaceId);
    const keys = nextSpace ? spaceProjectKeys(nextSpace) : nextProfile?.projectKeys;
    const candidates = projects.filter(
      (project) => !keys || keys.includes(`${project.environmentId}:${project.id}`),
    );
    const defaults = nextSpace ? spaceDeviceDefaults(nextSpace) : {};
    const defaultKey =
      (location ? defaults[location.environmentId] : undefined)?.projectKey ??
      Object.values(defaults)[0]?.projectKey;
    const next =
      candidates.find((project) => `${project.environmentId}:${project.id}` === defaultKey) ??
      candidates.find((project) => project.environmentId === location?.environmentId) ??
      candidates[0];
    setProfileId(nextProfileId);
    setSpaceId(nextSpaceId);
    setLocation(
      next ? { environmentId: next.environmentId, workspaceRoot: next.workspaceRoot } : null,
    );
    if (favorite && favorite.environmentId !== next?.environmentId) setFavorite(null);
  };
  const close = () => useChatCreationStore.setState({ request: null });
  const submit = async () => {
    if (!location || !locationAvailable || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (spaceId && !profile?.spaces?.some((space) => space.id === spaceId))
        throw new Error("This space was deleted. Choose another space.");
      if (request.draftId) {
        const draft = useComposerDraftStore.getState().getDraftSession(request.draftId);
        const composer = useComposerDraftStore.getState().getComposerDraft(request.draftId);
        if (!draft || draft.promotedTo)
          throw new Error("This draft has already been sent or removed.");
        if (
          draft.environmentId !== location.environmentId &&
          composer?.files.some((file) => file.file === null)
        )
          throw new Error(
            "Reattach the saved files before moving this draft to another device. Its current location and attachments have been kept.",
          );
      }
      if (favorite) {
        const provider = appAtomRegistry
          .get(serverEnvironment.providersValueAtom(location.environmentId))
          ?.find((item) => item.instanceId === favorite.provider);
        const reason = modelFavoriteUnavailable(favorite, provider, locationAvailable);
        if (favorite.environmentId !== location.environmentId)
          throw new Error("Choose this favorite's device.");
        if (reason) throw new Error(reason);
      }
      const favoriteSelection = favorite
        ? createModelSelection(favorite.provider, favorite.model, favorite.options)
        : undefined;
      const resolved = await resolveProject(location, profileId);
      const projectKey = scopedProjectKey(resolved.projectRef);
      if (request.draftId) {
        const store = useComposerDraftStore.getState();
        const draft = store.getDraftSession(request.draftId);
        if (!draft || draft.promotedTo)
          throw new Error("This draft has already been sent or removed.");
        const project = readProjects().find(
          (item) => scopedProjectKey(scopeProjectRef(item.environmentId, item.id)) === projectKey,
        );
        if (!project) throw new Error("Project unavailable. Try again.");
        const oldKey = scopedThreadKey(scopeThreadRef(draft.environmentId, draft.threadId));
        const nextKey = scopedThreadKey(scopeThreadRef(project.environmentId, draft.threadId));
        await saveProfiles((currentProfiles) => {
          const target = currentProfiles.find((item) => item.id === profileId);
          if (
            profileId !== ALL_PROFILE_ID &&
            (!target?.projectKeys.includes(projectKey) ||
              (spaceId && !target.spaces?.some((space) => space.id === spaceId)))
          )
            throw new Error("Profile or space changed. Choose the location again.");
          return currentProfiles.map((item) => {
            const clean = {
              ...item,
              spaces: item.spaces?.map((space) => ({
                ...space,
                threads: space.threads.filter((thread) => thread.threadKey !== oldKey),
              })),
            };
            return item.id === profileId
              ? moveThreadsToSpace(clean, [{ threadKey: nextKey, projectKey }], spaceId)
              : clean;
          });
        });
        const latest = useComposerDraftStore.getState().getDraftSession(request.draftId);
        if (
          !latest ||
          latest.promotedTo ||
          latest.threadId !== draft.threadId ||
          latest.environmentId !== draft.environmentId ||
          latest.projectId !== draft.projectId
        )
          throw new Error("This draft changed while saving. Reopen its location to continue.");
        // Open the affected draft before remapping: remapping can remove an empty
        // draft currently on screen, whose route would otherwise redirect home.
        if (chatMode !== "columns")
          await navigate({ to: "/draft/$draftId", params: { draftId: request.draftId } });
        store.setDraftThreadContext(request.draftId, { environmentSelection: "manual" });
        if (draft.projectId !== project.id || draft.environmentId !== project.environmentId) {
          store.setLogicalProjectDraftThreadId(
            deriveLogicalProjectKeyFromSettings(project, grouping),
            resolved.projectRef,
            request.draftId,
            { threadId: draft.threadId },
          );
          if (!hasExplicitComposerModelSelection(store.getComposerDraft(request.draftId))) {
            store.applyStickyState(request.draftId);
            if (project.defaultModelSelection)
              store.setModelSelection(request.draftId, project.defaultModelSelection, {
                replaceOptions: true,
              });
          }
        }
        if (favoriteSelection)
          store.setModelSelection(request.draftId, favoriteSelection, {
            explicit: true,
            replaceOptions: true,
          });
        await openInColumns({
          environmentId: project.environmentId,
          id: draft.threadId,
          title: "New chat",
          previousKey: oldKey,
        });
      } else {
        const locationKey = `${projectKey}:${profileId}:${spaceId}`;
        const opened =
          request.onCreated && boardDraft.current?.locationKey === locationKey
            ? boardDraft.current.opened
            : await handleNewThread(resolved.projectRef, {
                spaceId,
                ...(request.onCreated ? { navigate: false, forceNew: true } : {}),
                ...(favoriteSelection ? { modelSelection: favoriteSelection } : {}),
              });
        if (opened && request.onCreated) boardDraft.current = { locationKey, opened };
        if (!opened) throw new Error("The draft changed while opening. Try again.");
        if (favoriteSelection)
          useComposerDraftStore.getState().setModelSelection(opened.draftId, favoriteSelection, {
            explicit: true,
            replaceOptions: true,
          });
        await request.onCreated?.({ ...opened, projectRef: resolved.projectRef });
      }
      if (!request.onCreated) revealChatLocation(profileId, spaceId);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this location. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup
        className="max-w-md overflow-hidden"
        showCloseButton={!busy}
        initialFocus={locationAvailable ? submitButton : undefined}
      >
        <DialogHeader className="px-5 pb-4 pt-5">
          <DialogTitle className="font-sans text-base">
            {request.draftId ? "Chat location" : "New chat"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="min-h-0 overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                <span>Profile</span>
                <Select
                  value={profileId}
                  disabled={!!request.scope}
                  onValueChange={(id) => {
                    if (id) {
                      changeScope(id, null);
                    }
                  }}
                >
                  <SelectTrigger className="w-full min-w-0 font-normal" aria-label="Chat profile">
                    <SelectValue>{profile?.name ?? "All"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value={ALL_PROFILE_ID}>All (keep project profile)</SelectItem>
                    {profiles.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                <span>Space</span>
                <Select
                  value={spaceId ?? "outside"}
                  disabled={!profile || !!request.scope?.spaceId || !!request.scope?.unsorted}
                  onValueChange={(id) => {
                    if (id) changeScope(profileId, id === "outside" ? null : id);
                  }}
                >
                  <SelectTrigger className="w-full min-w-0 font-normal" aria-label="Chat space">
                    <SelectValue>
                      {profile?.spaces?.find((space) => space.id === spaceId)?.name ?? "Unsorted"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="outside">Unsorted</SelectItem>
                    {profile?.spaces?.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </label>
            </div>
            <FavoriteSetupPicker
              value={favorite}
              onChange={(next) => {
                setFavorite(next);
                if (next?.environmentId && next.environmentId !== location?.environmentId) {
                  const project = (
                    suggestedProjects ??
                    projects.filter(
                      (item) =>
                        !profile ||
                        profile.projectKeys.includes(`${item.environmentId}:${item.id}`),
                    )
                  ).find((item) => item.environmentId === next.environmentId);
                  setLocation(
                    project
                      ? {
                          environmentId: project.environmentId,
                          workspaceRoot: project.workspaceRoot,
                        }
                      : null,
                  );
                }
              }}
            />
            <ProjectLocationPicker
              key={`${profileId}:${spaceId ?? "outside"}:${favorite?.environmentId ?? "location"}`}
              suggestedProjects={suggestedProjects}
              initialEnvironmentId={favorite?.environmentId}
              value={location}
              onChange={(next) => {
                setLocation(next);
                if (next && favorite && next.environmentId !== favorite.environmentId)
                  setFavorite(null);
              }}
              disabled={busy}
            />
          </fieldset>
          {error && (
            <p
              role="alert"
              className="mx-5 mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter className="px-5 py-3">
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              ref={submitButton}
              type="submit"
              disabled={!location || !locationAvailable || busy}
            >
              {busy ? "Opening..." : request.draftId ? "Apply location" : "Open chat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
