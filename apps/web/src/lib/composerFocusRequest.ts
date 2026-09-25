/**
 * A one-shot "focus this chat's composer" request that outlives navigation: the requester
 * (a shortcut) fires before the target chat pane is active or even mounted, and the pane
 * claims it once it is the active pane for that thread.
 */
let pending: { threadKey: string; at: number } | null = null;
const listeners = new Set<() => void>();
/** Long enough for navigation and a pane mount; a request that never lands must not steal focus later. */
const REQUEST_TTL_MS = 3000;

export function requestComposerFocus(threadKey: string): void {
  pending = { threadKey, at: Date.now() };
  for (const listener of listeners) listener();
}

/** True once for the matching thread while the request is fresh, clearing it. */
export function claimComposerFocus(threadKey: string): boolean {
  if (pending === null || pending.threadKey !== threadKey) return false;
  const fresh = Date.now() - pending.at <= REQUEST_TTL_MS;
  pending = null;
  return fresh;
}

export function subscribeComposerFocusRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
