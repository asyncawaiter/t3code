import { moveProjectToProfile } from "../components/settings/ProjectSettingsPanel.logic";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { ALL_PROFILE_ID, type EnvironmentId, type Profile } from "@t3tools/contracts";
import { useCallback } from "react";
import { readLocalApi } from "../localApi";
import {
  findProjectByPath,
  inferProjectTitleFromPath,
  ensureBrowseDirectoryPath,
} from "../lib/projectPaths";
import { newProjectId } from "../lib/utils";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects, waitForProject } from "../state/entities";
import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import { filesystemEnvironment } from "../state/filesystem";
import { projectEnvironment } from "../state/projects";
import { primaryServerSettingsAtom, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import { toastManager } from "../components/ui/toast";

export interface ChatLocation {
  environmentId: EnvironmentId;
  workspaceRoot: string;
}

// Creation can update project membership, defaults and draft placement in succession.
// Serialize those writes and read settings when each write starts.
let profileWrites = Promise.resolve();
export function useSaveProfiles() {
  const primary = usePrimaryEnvironment();
  const { environments } = useEnvironments();
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  return useCallback(
    (update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>) => {
      const write = profileWrites.then(async () => {
        if (!primary?.serverConfig || primary.connection.phase !== "connected") {
          throw new Error("Connect the primary device to save profile placement.");
        }
        const current = appAtomRegistry.get(primaryServerSettingsAtom).profiles;
        const profiles = update(current);
        if (profiles === current) return;
        const result = await persist({
          environmentId: primary.environmentId,
          input: { patch: { profiles } },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        await Promise.all(
          environments
            .filter(
              (env) =>
                env.environmentId !== primary.environmentId && env.connection.phase === "connected",
            )
            .map(async (env) => {
              const replica = await persist({
                environmentId: env.environmentId,
                input: { patch: { profiles } },
              });
              if (replica._tag === "Failure")
                toastManager.add({
                  type: "warning",
                  title: `Profile sync failed on ${env.label}`,
                  description:
                    "Saved on the primary device. Retry shared settings sync in Settings.",
                });
            }),
        );
      });
      profileWrites = write.catch(() => {});
      return write;
    },
    [primary, environments, persist],
  );
}

export function useResolveChatProject() {
  const { environments } = useEnvironments();
  const browse = useAtomQueryRunner(filesystemEnvironment.browse, {
    reportFailure: false,
    refresh: true,
  });
  const create = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const saveProfiles = useSaveProfiles();
  return async (location: ChatLocation, profileId: string) => {
    const environment = environments.find((env) => env.environmentId === location.environmentId);
    if (environment?.connection.phase !== "connected")
      throw new Error("This device is offline. Reconnect it or choose another device.");
    const folder = await browse({
      environmentId: location.environmentId,
      input: { partialPath: ensureBrowseDirectoryPath(location.workspaceRoot) },
    });
    if (folder._tag === "Failure") throw squashAtomCommandFailure(folder);
    const workspaceRoot = folder.value.parentPath;
    const existing = findProjectByPath(
      readProjects().filter((project) => project.environmentId === location.environmentId),
      workspaceRoot,
    );
    const projectId = existing?.id ?? newProjectId();
    const ref = scopeProjectRef(location.environmentId, projectId);
    const key = scopedProjectKey(ref);
    const profiles = appAtomRegistry.get(primaryServerSettingsAtom).profiles;
    const profile = profiles.find((item) => item.id === profileId);
    if (profileId !== ALL_PROFILE_ID && !profile)
      throw new Error("This profile no longer exists. Choose another profile.");
    const previous = profiles.find((item) => item.projectKeys.includes(key));
    if (previous && previous.id !== profileId && profile) {
      const confirmed = await readLocalApi()?.dialogs.confirm(
        `Move “${existing?.title}” from ${previous.name} to ${profile.name}? This moves this checkout and its existing threads.`,
      );
      if (!confirmed)
        throw new Error("Project kept in its current profile. Choose another folder or profile.");
    }
    if (!existing) {
      const result = await create({
        environmentId: location.environmentId,
        input: {
          projectId,
          title: inferProjectTitleFromPath(workspaceRoot),
          workspaceRoot,
          createWorkspaceRootIfMissing: false,
          defaultModelSelection: null,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      await waitForProject(ref);
    }
    if (profile)
      await saveProfiles((current) => {
        if (!current.some((item) => item.id === profileId))
          throw new Error("This profile was deleted. Choose another profile.");
        if (current.find((item) => item.id === profileId)?.projectKeys.includes(key))
          return current;
        const currentOwner = current.find((item) => item.projectKeys.includes(key));
        if (currentOwner && currentOwner.id !== previous?.id)
          throw new Error(
            "This checkout changed profiles while selecting its location. Please try again.",
          );
        return moveProjectToProfile(current, key, profileId);
      });
    return { projectRef: ref, workspaceRoot, deviceLabel: environment.label };
  };
}
