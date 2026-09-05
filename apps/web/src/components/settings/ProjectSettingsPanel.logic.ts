import { ALL_PROFILE_ID, type Profile } from "@t3tools/contracts";

export function projectGroupTitleNeedsUpdate(
  memberTitles: ReadonlyArray<string>,
  nextTitle: string,
  wasEdited: boolean,
): boolean {
  return wasEdited && memberTitles.some((title) => title !== nextTitle);
}

/**
 * Move one checkout or a set of known checkouts to a profile, removing their
 * previous memberships. Null or All unassigns them; a missing target preserves them.
 */
export function moveProjectToProfile(
  profiles: ReadonlyArray<Profile>,
  projectKey: string | ReadonlyArray<string>,
  targetProfileId: string | null,
): ReadonlyArray<Profile> {
  if (
    targetProfileId !== null &&
    targetProfileId !== ALL_PROFILE_ID &&
    !profiles.some((profile) => profile.id === targetProfileId)
  )
    return profiles;
  const projectKeys = new Set(typeof projectKey === "string" ? [projectKey] : projectKey);
  const withoutProject = profiles.map((profile) => ({
    ...profile,
    projectKeys: profile.projectKeys.filter((key) => !projectKeys.has(key)),
    ...(profile.spaces
      ? {
          spaces: profile.spaces.map((space) => ({
            ...space,
            threads: space.threads.filter(
              (thread) => profile.id === targetProfileId || !projectKeys.has(thread.projectKey),
            ),
          })),
        }
      : {}),
  }));
  if (targetProfileId === null || targetProfileId === ALL_PROFILE_ID) {
    return withoutProject;
  }
  return withoutProject.map((profile) =>
    profile.id === targetProfileId
      ? { ...profile, projectKeys: [...profile.projectKeys, ...projectKeys] }
      : profile,
  );
}
