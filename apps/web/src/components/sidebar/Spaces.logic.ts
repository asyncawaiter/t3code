import { profileThreadFilter } from "@t3tools/client-runtime/state/profiles";
import {
  type Profile,
  type ProfileSpace,
  ALL_PROFILE_ID,
  spaceDeviceDefaults,
} from "@t3tools/contracts";

export function spaceProjectKeys(space: ProfileSpace) {
  return [
    ...new Set([
      ...space.threads.map((thread) => thread.projectKey),
      ...Object.values(spaceDeviceDefaults(space)).map((defaults) => defaults.projectKey),
    ]),
  ];
}

// Control characters cannot occur in real space IDs.
export const OUTSIDE_SPACES = "\0outside-spaces";

export function spaceDragId(profileId: string, spaceId: string | null) {
  return JSON.stringify(["space", profileId, spaceId]);
}

export function getSpaceDragData(data: Record<string, unknown> | undefined) {
  return data?.kind === "space" &&
    typeof data.profileId === "string" &&
    (data.spaceId === null || typeof data.spaceId === "string")
    ? {
        profileId: data.profileId,
        spaceId: data.spaceId,
        acceptsThreads: data.acceptsThreads !== false,
      }
    : null;
}

export function resolveSidebarSpaceFilter(profile: Profile, storedId: string | null) {
  if (profile.id === ALL_PROFILE_ID) return null;
  return storedId === null ||
    storedId === OUTSIDE_SPACES ||
    profile.spaces?.some((space) => space.id === storedId)
    ? storedId
    : OUTSIDE_SPACES;
}

export function matchesSidebarSpace(spaceId: string | undefined, filterId: string | null) {
  return (
    filterId === null ||
    (filterId === OUTSIDE_SPACES ? spaceId === undefined : spaceId === filterId)
  );
}

export function commonSpaceProfile(
  profiles: ReadonlyArray<Profile>,
  projectKeys: ReadonlyArray<string>,
) {
  if (!projectKeys.length) return undefined;
  return profiles.find(
    (profile) =>
      profile.id !== ALL_PROFILE_ID &&
      projectKeys.every((key) => profile.projectKeys.includes(key)),
  );
}

/** A space overview excludes global pins from other spaces and archived chats. */
export function spaceOverviewThreads<
  T extends {
    environmentId: string;
    id: string;
    projectId: string;
    archivedAt: string | null;
    updatedAt: string;
  },
>(
  profiles: ReadonlyArray<Profile>,
  profileId: string,
  filter: string | null,
  threads: ReadonlyArray<T>,
): T[] {
  const profile = profiles.find((item) => item.id === profileId);
  if (
    !profile ||
    (filter !== null &&
      filter !== OUTSIDE_SPACES &&
      !profile.spaces?.some((space) => space.id === filter))
  )
    return [];
  const matches = profileThreadFilter(profiles, profileId, filter);
  return threads
    .filter((thread) => thread.archivedAt === null && matches({ ...thread, pinnedAt: null }))
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
