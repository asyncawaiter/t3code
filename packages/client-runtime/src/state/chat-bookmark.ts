/** Focus alternates between a fixed bookmark and the chat it was opened from. */
export function resolveChatFocus(
  bookmarkedThreadKey: string | null,
  returnThreadKey: string | null,
  currentThreadKey: string | null,
) {
  if (bookmarkedThreadKey === null) return null;
  return {
    threadKey:
      currentThreadKey === bookmarkedThreadKey
        ? (returnThreadKey ?? bookmarkedThreadKey)
        : bookmarkedThreadKey,
    returnThreadKey:
      currentThreadKey !== null && currentThreadKey !== bookmarkedThreadKey
        ? currentThreadKey
        : returnThreadKey,
  };
}
