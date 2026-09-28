import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  spaceForThread,
  type Profile,
  type ScopedProjectRef,
  type ThreadId,
  type EnvironmentId,
  type ProjectId,
} from "@t3tools/contracts";

export function draftMatchesChatLocation(
  draft: { environmentId: EnvironmentId; projectId: ProjectId; threadId: ThreadId },
  project: ScopedProjectRef,
  spaceId: string | null,
  profiles: ReadonlyArray<Profile>,
) {
  const projectKey = scopedProjectKey(project);
  if (scopedProjectKey(scopeProjectRef(draft.environmentId, draft.projectId)) !== projectKey)
    return false;
  const profile = profiles.find((item) => item.projectKeys.includes(projectKey));
  const actual = profile
    ? (spaceForThread(
        profile,
        scopedThreadKey(scopeThreadRef(draft.environmentId, draft.threadId)),
        projectKey,
      )?.id ?? null)
    : null;
  return actual === spaceId;
}

/** The chat a new one copies its setup from: a board column, a draft, or the routed chat. */
export interface ChatSeed {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  /** Set for a sent chat running in its own worktree. */
  readonly worktreePath: string | null;
  /** Present for an unsent draft, whose checkout choice is still pending. */
  readonly draft?: {
    readonly envMode: "local" | "worktree";
    readonly branch: string | null;
    readonly startFromOrigin: boolean;
  };
}

/** The profile and space the seed chat sits in, so a new chat lands beside it. */
export function seedPlacement(
  profiles: ReadonlyArray<Profile>,
  seed: Pick<ChatSeed, "environmentId" | "projectId" | "threadId">,
): { profileId: string | undefined; spaceId: string | undefined } {
  const projectKey = scopedProjectKey(scopeProjectRef(seed.environmentId, seed.projectId));
  const threadKey = scopedThreadKey(scopeThreadRef(seed.environmentId, seed.threadId));
  for (const profile of profiles) {
    const space = spaceForThread(profile, threadKey, projectKey);
    if (space) return { profileId: profile.id, spaceId: space.id };
  }
  return {
    profileId: profiles.find((profile) => profile.projectKeys.includes(projectKey))?.id,
    spaceId: undefined,
  };
}

/**
 * Checkout options that put a new chat in the seed's situation: a worktree chat
 * gets a fresh worktree (never the seed's folder, where two agents would
 * collide), a main-checkout chat stays in the main checkout, and an unsent
 * draft passes on its pending choice. Branches only carry within one project.
 */
export function seedWorkspace(
  seed: ChatSeed,
  sameProject: boolean,
): {
  envMode: "local" | "worktree";
  branch?: string | null;
  worktreePath: null;
  startFromOrigin?: boolean;
} {
  if (seed.draft) {
    return {
      envMode: seed.draft.envMode,
      worktreePath: null,
      startFromOrigin: seed.draft.startFromOrigin,
      ...(sameProject ? { branch: seed.draft.branch } : {}),
    };
  }
  return { envMode: seed.worktreePath ? "worktree" : "local", branch: null, worktreePath: null };
}
