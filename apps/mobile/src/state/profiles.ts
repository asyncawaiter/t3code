import { useAtomValue } from "@effect/atom-react";
import {
  ALL_PROFILE,
  type EnvironmentId,
  type Profile,
  profileForProject,
  spaceForThread,
} from "@t3tools/contracts";
import {
  OUTSIDE_SPACES,
  profileThreadFilter,
  resolveProfileSource,
} from "@t3tools/client-runtime/state/profiles";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { profileEdits, profileEditsAtom } from "./profile-edits";
import { appAtomRegistry } from "./atom-registry";
import { environmentServerConfigsAtom, serverEnvironment } from "./server";
import { useWorkspaceState } from "./workspace";
import { useAtomCommand } from "./use-atom-command";
import { useAtomQueryRunner } from "./use-atom-query-runner";
import { useProjects, useThreadShells } from "./entities";
import { usePendingNewTasks } from "./use-pending-new-tasks";

export const profileSourceAtom = Atom.make((get) => {
  const configs = get(environmentServerConfigsAtom);
  const fallback =
    [...configs]
      .filter(([, config]) => config.environment.capabilities.profileSynchronization)
      .map(([id]) => id)
      .sort()[0] ?? null;
  const resolved = resolveProfileSource(configs, fallback);
  const { draft } = get(profileEditsAtom);
  const sourceId = draft?.sourceId ?? resolved.sourceId ?? fallback;
  const config = sourceId ? (configs.get(sourceId) ?? null) : null;
  return {
    sourceId,
    conflict:
      resolved.conflict || !!(draft && resolved.sourceId && draft.sourceId !== resolved.sourceId),
    config,
    profiles: draft?.profiles ?? config?.settings.profiles ?? [],
  };
});
export const profileSelectionAtom = Atom.make<{ profileId: string | null; spaceId: string | null }>(
  { profileId: null, spaceId: null },
).pipe(Atom.keepAlive);

export const profileRevealAtom = Atom.make<{ threadKey: string; request: number } | null>(
  null,
).pipe(Atom.keepAlive);

export function selectProfile(profileId: string | null) {
  appAtomRegistry.set(profileRevealAtom, null);
  appAtomRegistry.set(profileSelectionAtom, {
    profileId,
    spaceId: profileId ? OUTSIDE_SPACES : null,
  });
}
export function selectSpace(spaceId: string | null) {
  appAtomRegistry.set(profileRevealAtom, null);
  appAtomRegistry.set(profileSelectionAtom, {
    ...appAtomRegistry.get(profileSelectionAtom),
    spaceId,
  });
}
export function revealProfileThread(thread: {
  environmentId: string;
  id: string;
  projectId: string;
}) {
  const source = appAtomRegistry.get(profileSourceAtom);
  appAtomRegistry.set(profileRevealAtom, {
    threadKey: `${thread.environmentId}:${thread.id}`,
    request: (appAtomRegistry.get(profileRevealAtom)?.request ?? 0) + 1,
  });
  const key = `${thread.environmentId}:${thread.projectId}`;
  const profile = profileForProject(source.profiles, key);
  appAtomRegistry.set(profileSelectionAtom, {
    profileId: profile?.id ?? null,
    spaceId: profile
      ? (spaceForThread(profile, `${thread.environmentId}:${thread.id}`, key)?.id ?? OUTSIDE_SPACES)
      : null,
  });
}

export function useProfiles() {
  const source = useAtomValue(profileSourceAtom);
  const selection = useAtomValue(profileSelectionAtom);
  const { environments } = useWorkspaceState();
  const profile = source.profiles.find((item) => item.id === selection.profileId) ?? ALL_PROFILE;
  const spaceId =
    selection.spaceId === null ||
    selection.spaceId === OUTSIDE_SPACES ||
    profile.spaces?.some((space) => space.id === selection.spaceId)
      ? selection.spaceId
      : OUTSIDE_SPACES;
  const edits = useAtomValue(profileEditsAtom);
  const writable =
    edits.loaded &&
    source.sourceId !== null &&
    (source.config !== null || source.profiles.length > 0);
  const connected =
    !source.conflict &&
    source.config?.environment.capabilities.profileSynchronization === true &&
    environments.some(
      (env) => env.environmentId === source.sourceId && env.connectionState === "connected",
    );
  const matchesThread = useMemo(
    () => profileThreadFilter(source.profiles, profile.id, spaceId),
    [source.profiles, profile.id, spaceId],
  );
  return { ...source, profile, spaceId, writable, connected, matchesThread };
}

export function useSaveProfiles() {
  return useCallback(
    async (update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>) => {
      const source = appAtomRegistry.get(profileSourceAtom);
      if (!source.sourceId) throw new Error("Choose a profile source before editing organization.");
      await profileEdits.edit(source.sourceId, source.profiles, update);
    },
    [],
  );
}

export function useChooseProfileSource() {
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const { environments } = useWorkspaceState();
  return async (sourceId: EnvironmentId) => {
    const draft = profileEdits.snapshot().draft;
    if (draft && draft.sourceId !== sourceId)
      throw new Error("Sync pending organization edits before changing the shared source.");
    const configs = appAtomRegistry.get(environmentServerConfigsAtom);
    if (
      !configs.get(sourceId)?.environment.capabilities.profileSynchronization ||
      !environments.some(
        (env) => env.environmentId === sourceId && env.connectionState === "connected",
      )
    )
      throw new Error("Connect a device with profile synchronization support first.");
    for (const env of environments) {
      const config = configs.get(env.environmentId);
      if (
        env.connectionState !== "connected" ||
        !config?.environment.capabilities.profileSynchronization
      )
        continue;
      const result = await persist({
        environmentId: env.environmentId,
        input: {
          patch: { profileSyncSourceId: sourceId },
          expectedProfileSourceId: config.settings.profileSyncSourceId ?? null,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    }
  };
}

export function useProfileThreads() {
  const allProjects = useProjects();
  const allThreads = useThreadShells();
  const { profile, matchesThread } = useProfiles();
  const queued = usePendingNewTasks();
  const pendingTasks = useMemo(
    () =>
      queued.filter((task) =>
        matchesThread({
          environmentId: task.environmentId,
          id: task.kind === "pending" ? task.message.threadId : task.key,
          projectId: task.projectId,
        }),
      ),
    [queued, matchesThread],
  );
  const threads = useMemo(() => allThreads.filter(matchesThread), [allThreads, matchesThread]);
  const projects = useMemo(() => {
    if (profile.id === ALL_PROFILE.id) return allProjects;
    const keys = new Set(profile.projectKeys);
    for (const thread of threads) keys.add(`${thread.environmentId}:${thread.projectId}`);
    return allProjects.filter((project) => keys.has(`${project.environmentId}:${project.id}`));
  }, [allProjects, profile, threads]);
  return { projects, threads, pendingTasks };
}

/** Publish the source identity, keeping every host's legacy collection intact. */
export function useProfileSync() {
  const source = useProfiles();
  const edits = useAtomValue(profileEditsAtom);
  const read = useAtomQueryRunner(serverEnvironment.settings, {
    reportFailure: false,
    refresh: true,
  });
  const configs = useAtomValue(environmentServerConfigsAtom);
  const { environments } = useWorkspaceState();
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const attempted = useRef(new Set<string>());
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (
      !source.connected ||
      !source.sourceId ||
      (!source.config?.settings.profileSyncSourceId && source.profiles.length === 0)
    )
      return;
    for (const env of environments) {
      const config = configs.get(env.environmentId);
      if (
        env.connectionState !== "connected" ||
        !config?.environment.capabilities.profileSynchronization ||
        config.settings.profileSyncSourceId
      )
        continue;
      const key = `${env.environmentId}:${source.sourceId}:${retry}`;
      if (attempted.current.has(key)) continue;
      attempted.current.add(key);
      void persist({
        environmentId: env.environmentId,
        input: { patch: { profileSyncSourceId: source.sourceId }, expectedProfileSourceId: null },
      }).then((result) => {
        if (result._tag === "Failure") setFailed(true);
      });
    }
  }, [source, configs, environments, persist, retry]);
  const flush = useCallback(
    () =>
      profileEdits.flush({
        canSync: (id) => {
          const current = appAtomRegistry.get(profileSourceAtom);
          return source.connected && !current.conflict && current.sourceId === id;
        },
        read: async (id) => {
          const result = await read({ environmentId: id, input: {} });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          return result.value;
        },
        save: async (id, profiles, baseProfiles) => {
          const result = await persist({
            environmentId: id,
            input: { patch: { profiles, profileSyncSourceId: id }, baseProfiles },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        },
      }),
    [persist, read, source.connected],
  );
  useEffect(() => {
    if (source.connected && source.config && edits.draft) void flush();
  }, [edits.draft, flush, source.config, source.connected]);
  return {
    pending: edits.draft !== null,
    error: edits.error,
    discard: () => profileEdits.discard(),
    failed,
    retry: () => {
      setFailed(false);
      setRetry((value) => value + 1);
      void flush();
    },
  };
}
