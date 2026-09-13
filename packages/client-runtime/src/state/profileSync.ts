import {
  ALL_PROFILE_ID,
  indexProfilePins,
  indexProfileSpaces,
  Profile,
  mergeProfileEdits,
  EnvironmentId,
  type ServerConfig,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Equal from "effect/Equal";

/** Discover one source, preserving divergent legacy collections until the user chooses. */
export function resolveProfileSource(
  configs: ReadonlyMap<
    EnvironmentId,
    { settings: Pick<ServerSettings, "profiles" | "profileSyncSourceId"> }
  >,
  primaryId: EnvironmentId | null,
) {
  const sources = new Set(
    [...configs.values()].flatMap((config) =>
      config.settings.profileSyncSourceId ? [config.settings.profileSyncSourceId] : [],
    ),
  );
  if (sources.size > 1) return { sourceId: null, conflict: true };
  const explicit = [...sources][0];
  if (explicit) return { sourceId: explicit, conflict: false };
  const populated = [...configs].filter(([, config]) => config.settings.profiles.length > 0);
  if (
    populated.some(
      ([, config]) => !Equal.equals(config.settings.profiles, populated[0]?.[1].settings.profiles),
    )
  ) {
    return { sourceId: null, conflict: true };
  }
  const sourceId = populated.map(([id]) => id).sort()[0] ?? primaryId;
  return { sourceId, conflict: false };
}

// One receipt at a time per client. Each write reads the latest source settings.
let writes = Promise.resolve();
export function saveSharedProfiles(
  update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>,
  io: {
    getSource: () => {
      sourceId: EnvironmentId | null;
      conflict: boolean;
      config: {
        environment: {
          capabilities: Pick<ServerConfig["environment"]["capabilities"], "profileSynchronization">;
        };
      } | null;
    };
    read: (id: EnvironmentId) => Promise<Pick<ServerSettings, "profiles" | "profileSyncSourceId">>;
    save: (
      id: EnvironmentId,
      profiles: ReadonlyArray<Profile>,
      base: ReadonlyArray<Profile>,
    ) => Promise<void>;
  },
) {
  const write = writes.then(async () => {
    const source = io.getSource();
    if (source.conflict) throw new Error("Choose a shared profile source before editing.");
    if (!source.sourceId || !source.config)
      throw new Error(
        "Connect the shared profile source to edit organization. Chats remain available on their hosts.",
      );
    if (source.config.environment.capabilities.profileSynchronization !== true)
      throw new Error("Update the profile source to a build supporting profile synchronization.");
    const settings = await io.read(source.sourceId);
    if (settings.profileSyncSourceId && settings.profileSyncSourceId !== source.sourceId)
      throw new Error("The shared profile source changed. Reconnect and retry.");
    const profiles = update(settings.profiles);
    if (profiles !== settings.profiles) await io.save(source.sourceId, profiles, settings.profiles);
  });
  writes = write.catch(() => {});
  return write;
}

export const OUTSIDE_SPACES = "\0outside-spaces";

/** Counts every chat in the profile, independently of the selected Space or project filter. */
export function profileSpaceCounts(
  profiles: ReadonlyArray<Profile>,
  profileId: string | null,
  threads: ReadonlyArray<{
    environmentId: string;
    id: string;
    projectId: string;
    archivedAt?: string | null;
  }>,
) {
  const profile = profiles.find((entry) => entry.id === profileId);
  const projects = profile && profile.id !== ALL_PROFILE_ID ? new Set(profile.projectKeys) : null;
  const spaces = indexProfileSpaces(profiles);
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const projectKey = `${thread.environmentId}:${thread.projectId}`;
    if (thread.archivedAt || (projects && !projects.has(projectKey))) continue;
    const placement = spaces.get(`${thread.environmentId}:${thread.id}`);
    const spaceId = placement?.projectKey === projectKey ? placement.space.id : OUTSIDE_SPACES;
    counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
  }
  return counts;
}

export function profileThreadFilter(
  profiles: ReadonlyArray<Profile>,
  profileId: string | null,
  spaceId: string | null,
) {
  const profile = profiles.find((entry) => entry.id === profileId);
  const projectKeys = profile ? new Set(profile.projectKeys) : null;
  const spaces = indexProfileSpaces(profiles);
  const pins = indexProfilePins(profiles);
  return (thread: {
    environmentId: string;
    id: string;
    projectId: string;
    pinnedAt?: string | null | undefined;
  }) => {
    const allProfiles = !profile || profileId === ALL_PROFILE_ID;
    const key = `${thread.environmentId}:${thread.id}`;
    const projectKey = `${thread.environmentId}:${thread.projectId}`;
    if (thread.pinnedAt) {
      const pin = pins.get(key);
      if (!pin) return true;
      if (pin.profileId === profileId && pin.spaceId === null) return true;
    }
    if (!allProfiles && !projectKeys?.has(projectKey)) return false;
    const placement = spaces.get(key);
    const assigned = placement?.projectKey === projectKey ? placement.space.id : undefined;
    return spaceId === null || (spaceId === OUTSIDE_SPACES ? !assigned : assigned === spaceId);
  };
}

/** Move the project as a unit, retaining assignments already in the destination. */
export function moveProjectToProfile(
  profiles: ReadonlyArray<Profile>,
  projectKey: string,
  profileId: string | null,
): ReadonlyArray<Profile> {
  if (profileId && !profiles.some((profile) => profile.id === profileId))
    throw new Error("That profile was removed. Choose another destination.");
  return profiles.map((profile) => {
    if (profile.id === profileId)
      return profile.projectKeys.includes(projectKey)
        ? profile
        : { ...profile, projectKeys: [...profile.projectKeys, projectKey] };
    if (!profile.projectKeys.includes(projectKey)) return profile;
    return {
      ...profile,
      projectKeys: profile.projectKeys.filter((key) => key !== projectKey),
      spaces: profile.spaces?.map((space) => ({
        ...space,
        threads: space.threads.filter((thread) => thread.projectKey !== projectKey),
      })),
      threadPins: profile.threadPins?.filter((pin) => pin.projectKey !== projectKey),
    };
  });
}

const ProfileEditDraft = Schema.NullOr(
  Schema.Struct({
    sourceId: EnvironmentId,
    base: Schema.Array(Profile),
    profiles: Schema.Array(Profile),
  }),
);
const decodeProfileEditDraft = Schema.decodeUnknownSync(ProfileEditDraft);
const decodeProfiles = Schema.decodeUnknownSync(Schema.Array(Profile));
export type ProfileEditState = {
  loaded: boolean;
  draft: typeof ProfileEditDraft.Type;
  error: string | null;
};

/** Persist organization edits before exposing them, then merge against fresh shared settings. */
export function createProfileEditQueue(storage: {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  changed: (state: ProfileEditState) => void;
  lock?: (scope: "edit" | "sync", run: () => Promise<void>) => Promise<void>;
}) {
  let state: ProfileEditState = { loaded: false, draft: null, error: null };
  const publish = (next: ProfileEditState) => {
    state = next;
    storage.changed(state);
  };
  const loaded = storage
    .read()
    .then((value) =>
      publish({
        loaded: true,
        draft: value ? decodeProfileEditDraft(JSON.parse(value)) : null,
        error: null,
      }),
    )
    .catch((error: unknown) => {
      publish({ ...state, error: `Could not load pending organization edits: ${String(error)}` });
    });
  const lock = storage.lock ?? ((_scope, run) => run());
  const refresh = async () => {
    const value = await storage.read();
    const draft = value ? decodeProfileEditDraft(JSON.parse(value)) : null;
    if (!Equal.equals(state.draft, draft)) publish({ loaded: true, draft, error: null });
  };
  let writes = loaded;
  const change = (update: () => Promise<void>) => {
    const result = writes.then(() =>
      lock("edit", async () => {
        if (storage.lock) await refresh();
        await update();
      }),
    );
    writes = result.catch(() => {});
    return result;
  };
  const store = async (draft: typeof ProfileEditDraft.Type) => {
    await storage.write(JSON.stringify(draft));
    publish({ loaded: true, draft, error: null });
  };
  let draining: Promise<void> | null = null;
  return {
    ready: loaded,
    snapshot: () => state,
    refresh: () => change(refresh),
    edit: (
      sourceId: EnvironmentId,
      profiles: ReadonlyArray<Profile>,
      update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>,
    ) =>
      change(async () => {
        if (!state.loaded) throw new Error(state.error ?? "Loading saved organization edits.");
        if (state.draft && state.draft.sourceId !== sourceId)
          throw new Error("Sync pending organization edits before changing the shared source.");
        const current = state.draft?.profiles ?? profiles;
        const next = decodeProfiles(update(current));
        if (Equal.equals(current, next)) return;
        await store({ sourceId, base: state.draft?.base ?? profiles, profiles: next });
      }),
    discard: async () => {
      if (draining) throw new Error("Wait for the current sync to finish before discarding edits.");
      await lock("sync", () => change(() => store(null)));
    },
    flush(io: {
      canSync: (sourceId: EnvironmentId) => boolean;
      read: (
        sourceId: EnvironmentId,
      ) => Promise<Pick<ServerSettings, "profiles" | "profileSyncSourceId">>;
      save: (
        sourceId: EnvironmentId,
        profiles: ReadonlyArray<Profile>,
        base: ReadonlyArray<Profile>,
      ) => Promise<void>;
    }): Promise<void> {
      if (draining) return draining;
      draining = lock("sync", async () => {
        await change(async () => {});
        while (state.draft && io.canSync(state.draft.sourceId)) {
          const sent = state.draft;
          const remote = await io.read(sent.sourceId);
          if (!io.canSync(sent.sourceId)) return;
          if (remote.profileSyncSourceId && remote.profileSyncSourceId !== sent.sourceId)
            throw new Error(
              "The shared profile source changed. Pending edits remain on this device.",
            );
          const merged = mergeProfileEdits(remote.profiles, sent.base, sent.profiles);
          await io.save(sent.sourceId, merged, remote.profiles);
          await change(async () => {
            const current = state.draft;
            if (!current || current.sourceId !== sent.sourceId) return;
            if (Equal.equals(current, sent)) await store(null);
            else
              await store({
                sourceId: current.sourceId,
                base: merged,
                profiles: mergeProfileEdits(merged, sent.profiles, current.profiles),
              });
          });
        }
      })
        .catch((error: unknown) => {
          publish({
            ...state,
            error:
              error instanceof Error
                ? error.message
                : "Organization sync failed. Retry when connected.",
          });
        })
        .finally(() => {
          draining = null;
        });
      return draining;
    },
  };
}
