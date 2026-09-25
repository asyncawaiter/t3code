/**
 * Chats in the order they were last used, for "back to the last chat" (Cmd+L).
 * Like a browser's last-tab switch: from a chat it flips between the two most
 * recent; from anywhere else it returns to the latest.
 */
const STORAGE_KEY = "t3code:recent-chats";
const LIMIT = 20;

let recent: string[] = readRecent();
let shownChat: string | null = null;

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/** Marks a chat as the one in use: it is on screen and has the reader's focus. */
export function recordChatUse(threadKey: string): void {
  shownChat = threadKey;
  if (recent[0] === threadKey) return;
  recent = [threadKey, ...recent.filter((key) => key !== threadKey)].slice(0, LIMIT);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // A full or blocked storage only costs the list across reloads.
  }
}

/** The chat stopped being on screen (its pane lost focus or unmounted). */
export function releaseChat(threadKey: string): void {
  if (shownChat === threadKey) shownChat = null;
}

/** Where Cmd+L goes: the previous chat when one is showing, else the latest. */
export function recentChatTarget(): string | null {
  if (shownChat !== null && recent[0] === shownChat) return recent[1] ?? null;
  return recent[0] ?? null;
}

/** Test hook: start from a known history. */
export function resetRecentChats(keys: readonly string[] = []): void {
  recent = [...keys];
  shownChat = null;
}
