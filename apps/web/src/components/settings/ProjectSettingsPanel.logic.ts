import { ALL_PROFILE_ID, type Profile } from "@t3tools/contracts";

export function projectGroupTitleNeedsUpdate(
  memberTitles: ReadonlyArray<string>,
  nextTitle: string,
  wasEdited: boolean,
): boolean {
  return wasEdited && memberTitles.some((title) => title !== nextTitle);
}

/**
 * Move a project to `targetProfileId`, dropping it from every other profile
 * first. `null` (or the synthesized "All" id, which is never stored) just
 * unassigns the project.
 */
export function moveProjectToProfile(
  profiles: ReadonlyArray<Profile>,
  projectKey: string,
  targetProfileId: string | null,
): ReadonlyArray<Profile> {
  const withoutProject = profiles.map((profile) => ({
    ...profile,
    projectKeys: profile.projectKeys.filter((key) => key !== projectKey),
  }));
  if (targetProfileId === null || targetProfileId === ALL_PROFILE_ID) {
    return withoutProject;
  }
  return withoutProject.map((profile) =>
    profile.id === targetProfileId
      ? { ...profile, projectKeys: [...profile.projectKeys, projectKey] }
      : profile,
  );
}
