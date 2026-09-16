import {
  getThreadSortTimestamp,
  type ThreadSortInput,
} from "@t3tools/client-runtime/state/thread-sort";

/** Keep groups contiguous, ordered by their first chat, without changing membership. */
export function groupSidebarChats<T>(chats: readonly T[], groupKey: (chat: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const chat of chats) {
    const key = groupKey(chat);
    const group = groups.get(key);
    if (group) group.push(chat);
    else groups.set(key, [chat]);
  }
  return [...groups.values()].flat();
}

export function recentSidebarChats<
  T extends ThreadSortInput & { id: string; environmentId: string },
>(chats: readonly T[]): T[] {
  return chats.toSorted(
    (left, right) =>
      getThreadSortTimestamp(right, "updated_at") - getThreadSortTimestamp(left, "updated_at") ||
      left.environmentId.localeCompare(right.environmentId) ||
      left.id.localeCompare(right.id),
  );
}
