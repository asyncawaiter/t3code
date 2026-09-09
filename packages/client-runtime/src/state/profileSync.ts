import {
  ALL_PROFILE_ID,
  indexProfilePins,
  indexProfileSpaces,
  type Profile,
  type EnvironmentId,
  type ServerConfig,
  type ServerSettings,
} from "@t3tools/contracts";
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
    pinnedAt?: string | null;
  }) => {
    if (!profile || profileId === ALL_PROFILE_ID) return true;
    const key = `${thread.environmentId}:${thread.id}`;
    const projectKey = `${thread.environmentId}:${thread.projectId}`;
    if (thread.pinnedAt) {
      const pin = pins.get(key);
      if (!pin) return true;
      if (pin.profileId === profileId && pin.spaceId === null) return true;
    }
    if (!projectKeys?.has(projectKey)) return false;
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
