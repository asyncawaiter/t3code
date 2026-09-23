import type { Profile } from "@t3tools/contracts";
import type { LocatedWorkItem } from "../../workItems";

export interface TaskShelfScope {
  profileId?: string | null | undefined;
  spaceId?: string | null | undefined;
  environmentId?: string | null | undefined;
  projectKey?: string | undefined;
  search?: string | undefined;
  query?: string | undefined;
}

export function filterTaskShelfItems(tasks: readonly LocatedWorkItem[], scope: TaskShelfScope) {
  return tasks.filter(
    ({ environmentId, item }) =>
      (!scope.profileId || scope.profileId === "all" || item.profileId === scope.profileId) &&
      (scope.spaceId === undefined || item.spaceId === scope.spaceId) &&
      (!scope.environmentId ||
        (item.executionEnvironmentId ?? environmentId) === scope.environmentId) &&
      (!scope.projectKey ||
        scope.projectKey === "all" ||
        `${item.executionEnvironmentId ?? environmentId}:${item.projectId}` === scope.projectKey) &&
      [scope.search, scope.query].every(
        (query) =>
          !query?.trim() ||
          `${item.title} ${item.notes} ${item.brief}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
  );
}

/** IDs keep equally named Spaces, and Unsorted in different profiles, separate. */
export function groupTasksBySpace(tasks: readonly LocatedWorkItem[], profiles: readonly Profile[]) {
  const groups = new Map<
    string,
    {
      key: string;
      profileName: string;
      spaceName: string;
      color: Profile["color"] | undefined;
      tasks: LocatedWorkItem[];
    }
  >();
  for (const task of tasks) {
    const { profileId, spaceId } = task.item;
    const key = JSON.stringify([profileId, spaceId]);
    let group = groups.get(key);
    if (!group) {
      const profile = profiles.find((profile) => profile.id === profileId);
      group = {
        key,
        profileName: profile?.name ?? "Unassigned",
        spaceName: spaceId
          ? (profile?.spaces?.find((space) => space.id === spaceId)?.name ?? "Unavailable space")
          : "Unsorted",
        color: profile?.color,
        tasks: [],
      };
      groups.set(key, group);
    }
    group.tasks.push(task);
  }
  return [...groups.values()];
}
