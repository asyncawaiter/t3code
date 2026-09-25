/**
 * Where Escape goes back to after columns mode's space shortcuts (Cmd+O, Cmd+P). The trip
 * back is only offered while the user is still on the page the shortcut opened.
 */
let pending: { destination: string | null; back: () => void } | null = null;

export function setColumnsReturn(back: () => void): void {
  pending = { destination: null, back };
}

type PageLocation = { pathname: string; search: Record<string, unknown> };

/** The page itself, ignoring parameters a page rewrites on its own (filters, focus). */
function pageKey(location: PageLocation): string {
  const identity = ["view", "workspace", "space", "unsorted", "project", "device", "board"].map(
    (key) => String(location.search[key] ?? ""),
  );
  return [location.pathname, ...identity].join("|");
}

export function markColumnsReturnDestination(location: PageLocation): void {
  if (pending) pending.destination = pageKey(location);
}

/** The way back when `location` is still the shortcut's destination; consumes it. */
export function takeColumnsReturn(location: PageLocation): (() => void) | null {
  if (!pending || pending.destination !== pageKey(location)) return null;
  const { back } = pending;
  pending = null;
  return back;
}
