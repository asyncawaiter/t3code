// Enough hits to see every same-named file in a typical repo. The finder ranks
// suffix matches for a partial path first, so a second copy past this page is
// only a risk for names spread over dozens of folders (`index.ts`), and those
// already come back ambiguous.
export const WORKSPACE_FILE_LOOKUP_LIMIT = 50;
/** How many candidates the "which file?" menu lists. */
export const WORKSPACE_FILE_CHOICE_LIMIT = 12;

// One counter for every caller: they all open the same panel, so the newest
// click wins regardless of which one started the lookup.
let latestLookupSequence = 0;

/** Call the returned predicate when the search settles; false means a later click superseded it. */
export function claimWorkspaceFileLookup(): () => boolean {
  latestLookupSequence += 1;
  const claimed = latestLookupSequence;
  return () => claimed === latestLookupSequence;
}

export interface WorkspaceEntryCandidate {
  readonly path: string;
  readonly kind: "file" | "directory";
}

export type WorkspaceFileLookup =
  | { readonly kind: "match"; readonly path: string }
  | { readonly kind: "choose"; readonly paths: ReadonlyArray<string> }
  | { readonly kind: "none" };

/**
 * Which indexed file a chat link means, given the workspace-relative path the
 * agent wrote (`ChatView.tsx`, `lib/columnsReturn.ts`). A file opens on its own
 * only when exactly one fits: the path as written, else the one file ending in
 * it. Several fits are the reader's choice; `touched` (files the agent read or
 * edited in this chat) only puts the likely ones first, it never picks.
 */
export function matchWorkspaceFile(
  requested: string,
  entries: ReadonlyArray<WorkspaceEntryCandidate>,
  touched: (path: string) => boolean = () => false,
): WorkspaceFileLookup {
  const target = requested.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!target) return { kind: "none" };
  const files = entries.filter((entry) => entry.kind === "file").map((entry) => entry.path);
  if (files.includes(target)) return { kind: "match", path: target };

  const fits = (candidates: ReadonlyArray<string>): WorkspaceFileLookup | null => {
    const [only, ...rest] = candidates;
    if (only === undefined) return null;
    if (rest.length === 0) return { kind: "match", path: only };
    const rank = (path: string) => (touched(path) ? 0 : 1);
    return {
      kind: "choose",
      paths: candidates.toSorted((a, b) => rank(a) - rank(b) || a.length - b.length),
    };
  };
  const suffix = `/${target}`;
  const folded = target.toLowerCase();
  return (
    fits(files.filter((path) => path.endsWith(suffix))) ??
    // Casing that drifted from disk still resolves; `FOO.ts` against both
    // `Foo.ts` and `foo.ts` becomes a choice rather than a guess.
    fits(
      files.filter((path) => {
        const lower = path.toLowerCase();
        return lower === folded || lower.endsWith(`/${folded}`);
      }),
    ) ?? { kind: "none" }
  );
}
