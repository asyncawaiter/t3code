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
