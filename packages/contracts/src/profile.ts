/**
 * Profiles - named, colored groups of projects shown in the sidebar
 * (Arc-browser style). Clients read profile definitions from one shared
 * source environment; the active profile a client has
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
import * as Equal from "effect/Equal";
import { ModelSelection } from "./orchestration.ts";
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

export const ProfileSpace = Schema.Struct({
  id: ProfileId,
  name: ProfileName,
  newChatDefaults: Schema.optional(
    Schema.Struct({
      projectKey: TrimmedNonEmptyString,
      deviceLabel: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
      workspaceRoot: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
      modelSelection: Schema.optional(ModelSelection),
      envMode: Schema.optional(Schema.Literals(["local", "worktree"])),
    }),
  ),
  threads: Schema.Array(
    Schema.Struct({
      threadKey: TrimmedNonEmptyString,
      projectKey: TrimmedNonEmptyString,
    }),
  ).check(Schema.isMaxLength(10000)),
});
export type ProfileSpace = typeof ProfileSpace.Type;

export const Profile = Schema.Struct({
  id: ProfileId,
  name: ProfileName,
  color: ProfileColor,
  projectKeys: Schema.Array(Schema.String),
  spaces: Schema.optional(Schema.Array(ProfileSpace).check(Schema.isMaxLength(64))),
  threadPins: Schema.optional(
    Schema.Array(
      Schema.Struct({
        threadKey: TrimmedNonEmptyString,
        projectKey: TrimmedNonEmptyString,
        spaceId: Schema.NullOr(ProfileId),
      }),
    ).check(Schema.isMaxLength(10000)),
  ),
});
export type Profile = typeof Profile.Type;

function mergeValue<T>(current: T, base: T, edited: T): T {
  if (Equal.equals(base, edited) || Equal.equals(current, edited)) return current;
  if (Equal.equals(current, base)) return edited;
  throw new Error(
    "This profile field changed on another device. Review its latest value and retry.",
  );
}

function mergeMembers(
  current: ReadonlyArray<string>,
  base: ReadonlyArray<string>,
  edited: ReadonlyArray<string>,
) {
  const before = new Set(base);
  const after = new Set(edited);
  const removed = new Set(base.filter((key) => !after.has(key)));
  return [
    ...new Set([
      ...current.filter((key) => !removed.has(key)),
      ...edited.filter((key) => !before.has(key)),
    ]),
  ];
}

/** Merge keyed organization rows; reject competing edits to the same field or order. */
function mergeRows<T>(
  current: ReadonlyArray<T>,
  base: ReadonlyArray<T>,
  edited: ReadonlyArray<T>,
  key: (row: T) => string,
  merge: (current: T, base: T, edited: T) => T = mergeValue,
): ReadonlyArray<T> {
  const before = new Map(base.map((row) => [key(row), row]));
  const after = new Map(edited.map((row) => [key(row), row]));
  const live = new Map(current.map((row) => [key(row), row]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id),
      next = after.get(id),
      existing = live.get(id);
    if (Equal.equals(old, next)) continue;
    const resolved =
      old !== undefined && next !== undefined && existing !== undefined
        ? merge(existing, old, next)
        : mergeValue(existing, old, next);
    if (resolved === undefined) live.delete(id);
    else live.set(id, resolved);
  }
  const commonOrder = (rows: ReadonlyArray<T>) =>
    rows.map(key).filter((id) => before.has(id) && after.has(id) && live.has(id));
  const reordered = !Equal.equals(commonOrder(base), commonOrder(edited));
  if (reordered) mergeValue(commonOrder(current), commonOrder(base), commonOrder(edited));
  let existingFollows = false;
  let insertedBeforeExisting = false;
  for (let index = edited.length - 1; index >= 0; index--) {
    if (before.has(key(edited[index]!))) existingFollows = true;
    else if (existingFollows) insertedBeforeExisting = true;
  }
  const order = new Set([
    ...(reordered || insertedBeforeExisting ? edited : current).map(key),
    ...live.keys(),
  ]);
  return [...order].flatMap((id) => {
    const row = live.get(id);
    return row === undefined ? [] : [row];
  });
}

function mergeSpace(current: ProfileSpace, base: ProfileSpace, edited: ProfileSpace): ProfileSpace {
  return {
    ...current,
    name: mergeValue(current.name, base.name, edited.name),
    newChatDefaults: mergeValue(
      current.newChatDefaults,
      base.newChatDefaults,
      edited.newChatDefaults,
    ),
    threads: mergeRows(current.threads, base.threads, edited.threads, (thread) => thread.threadKey),
  };
}

function mergeProfile(current: Profile, base: Profile, edited: Profile): Profile {
  return {
    ...current,
    name: mergeValue(current.name, base.name, edited.name),
    color: mergeValue(current.color, base.color, edited.color),
    projectKeys: mergeMembers(current.projectKeys, base.projectKeys, edited.projectKeys),
    ...(current.spaces || base.spaces || edited.spaces
      ? {
          spaces: mergeRows(
            current.spaces ?? [],
            base.spaces ?? [],
            edited.spaces ?? [],
            (space) => space.id,
            mergeSpace,
          ),
        }
      : {}),
    ...(current.threadPins || base.threadPins || edited.threadPins
      ? {
          threadPins: mergeRows(
            current.threadPins ?? [],
            base.threadPins ?? [],
            edited.threadPins ?? [],
            (pin) => pin.threadKey,
          ),
        }
      : {}),
  };
}

/** Apply concurrent organizational edits without replacing another client's unrelated work. */
export function mergeProfileEdits(
  current: ReadonlyArray<Profile>,
  base: ReadonlyArray<Profile>,
  edited: ReadonlyArray<Profile>,
): ReadonlyArray<Profile> {
  const profiles = mergeRows(current, base, edited, (profile) => profile.id, mergeProfile);
  const projects = new Set<string>();
  const threads = new Set<string>();
  for (const profile of profiles) {
    for (const project of profile.projectKeys) {
      if (projects.has(project))
        throw new Error(
          "This project was assigned to another profile. Review its placement and retry.",
        );
      projects.add(project);
    }
    for (const space of profile.spaces ?? [])
      for (const thread of space.threads) {
        if (threads.has(thread.threadKey))
          throw new Error(
            "This chat was assigned to another space. Review its placement and retry.",
          );
        threads.add(thread.threadKey);
      }
  }
  return profiles;
}

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
  return id === null || id === undefined
    ? undefined
    : profiles.find((profile) => profile.id === id);
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

/** Resolve only assignments whose project still belongs to this profile. */
export function spaceForThread(profile: Profile, threadKey: string, projectKey: string) {
  if (!isProjectInProfile(profile, projectKey)) return undefined;
  return profile.spaces?.find((space) =>
    space.threads.some(
      (thread) => thread.threadKey === threadKey && thread.projectKey === projectKey,
    ),
  );
}

/** A thread has one placement within a profile; null returns it to the root. */
export function moveThreadsToSpace(
  profile: Profile,
  threads: ReadonlyArray<{ threadKey: string; projectKey: string }>,
  spaceId: string | null,
): Profile {
  if (spaceId !== null && !profile.spaces?.some((space) => space.id === spaceId)) return profile;
  const eligible = [
    ...new Map(
      threads
        .filter((thread) => profile.projectKeys.includes(thread.projectKey))
        .map((thread) => [thread.threadKey, thread]),
    ).values(),
  ];
  const keys = new Set(eligible.map((thread) => thread.threadKey));
  return {
    ...profile,
    ...(profile.threadPins
      ? {
          threadPins: profile.threadPins.map((pin) =>
            keys.has(pin.threadKey) && pin.spaceId !== spaceId ? { ...pin, spaceId: null } : pin,
          ),
        }
      : {}),
    spaces: profile.spaces?.map((space) => ({
      ...space,
      threads: [
        ...space.threads.filter((thread) => !keys.has(thread.threadKey)),
        ...(space.id === spaceId ? eligible : []),
      ],
    })),
  };
}

/** Build once per settings change, then resolve sidebar and dashboard rows in constant time. */
export function indexProfileSpaces(profiles: ReadonlyArray<Profile>) {
  const result = new Map<string, { profile: Profile; space: ProfileSpace; projectKey: string }>();
  for (const profile of profiles) {
    const projects = new Set(profile.projectKeys);
    for (const space of profile.spaces ?? [])
      for (const thread of space.threads) {
        if (projects.has(thread.projectKey) && !result.has(thread.threadKey))
          result.set(thread.threadKey, { profile, space, projectKey: thread.projectKey });
      }
  }
  return result;
}

/** Missing entries are global pins; stale space pins fall back to their owning profile. */
export function indexProfilePins(profiles: ReadonlyArray<Profile>) {
  const result = new Map<string, { profileId: string; spaceId: string | null }>();
  for (const profile of profiles) {
    const projects = new Set(profile.projectKeys);
    for (const pin of profile.threadPins ?? []) {
      if (!projects.has(pin.projectKey)) continue;
      const space = spaceForThread(profile, pin.threadKey, pin.projectKey);
      result.set(pin.threadKey, {
        profileId: profile.id,
        spaceId: pin.spaceId === space?.id ? pin.spaceId : null,
      });
    }
  }
  return result;
}
