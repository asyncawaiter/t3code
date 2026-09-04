/**
 * Profiles - named, colored groups of projects shown in the sidebar
 * (Arc-browser style). Profile definitions sync across every connected
 * environment as a shared server setting; the active profile a client has
 * selected is client-local and lives elsewhere.
 *
 * `projectKeys` holds scoped project keys in the client-runtime format
 * `${environmentId}:${projectId}` (see `scopedProjectKey` in
 * `packages/client-runtime/src/environment/scoped.ts`), so one profile can
 * span projects from more than one environment.
 *
 * @module Profile
 */
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const PROFILE_NAME_MAX_LENGTH = 48;
export const PROFILE_MAX_COUNT = 24;

/**
 * Control characters are rejected because ids are folded into delimiter-joined
 * cache keys on the client; one carrying the delimiter would resolve to a
 * different profile.
 */
export const ProfileId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[^\p{Cc}]+$/u),
);
export type ProfileId = typeof ProfileId.Type;

export const ProfileName = TrimmedNonEmptyString.check(Schema.isMaxLength(PROFILE_NAME_MAX_LENGTH));

export const PROFILE_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
] as const;
export const ProfileColor = Schema.Literals(PROFILE_COLORS);
export type ProfileColor = typeof ProfileColor.Type;

export const Profile = Schema.Struct({
  id: ProfileId,
  name: ProfileName,
  color: ProfileColor,
  projectKeys: Schema.Array(Schema.String),
});
export type Profile = typeof Profile.Type;

export const ALL_PROFILE_ID: ProfileId = "all";

/**
 * The "All" profile is synthesized, never stored, and matches every project
 * regardless of `projectKeys`.
 */
export const ALL_PROFILE: Profile = {
  id: ALL_PROFILE_ID,
  name: "All",
  color: "gray",
  projectKeys: [],
};

/**
 * The full picker list: `ALL_PROFILE` first, then the user's own profiles.
 * Entries colliding with the `all` id or repeating an earlier id are dropped;
 * first entry wins.
 */
export function resolveProfiles(userProfiles: ReadonlyArray<Profile>): ReadonlyArray<Profile> {
  const seen = new Set<string>([ALL_PROFILE_ID]);
  const resolved = [ALL_PROFILE];
  for (const profile of userProfiles) {
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    resolved.push(profile);
  }
  return resolved;
}

export function findProfile(
  profiles: ReadonlyArray<Profile>,
  id: string | null | undefined,
): Profile | undefined {
  return id === null || id === undefined ? undefined : profiles.find((profile) => profile.id === id);
}

export function isProjectInProfile(profile: Profile, projectKey: string): boolean {
  return profile.id === ALL_PROFILE_ID || profile.projectKeys.includes(projectKey);
}

export function profileForProject(
  profiles: ReadonlyArray<Profile>,
  projectKey: string,
): Profile | undefined {
  return profiles.find(
    (profile) => profile.id !== ALL_PROFILE_ID && profile.projectKeys.includes(projectKey),
  );
}

/**
 * Cyclic step through `profiles` order. An unknown `currentId` (including
 * `null`) is treated as index 0 (All).
 */
export function nextProfileId(
  profiles: ReadonlyArray<Profile>,
  currentId: string | null,
  direction: "next" | "previous",
): ProfileId {
  const currentIndex = Math.max(
    0,
    profiles.findIndex((profile) => profile.id === currentId),
  );
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (currentIndex + delta + profiles.length) % profiles.length;
  const next = profiles[nextIndex];
  if (next === undefined) {
    throw new Error("nextProfileId: profiles must not be empty");
  }
  return next.id;
}
