import { normalizeSearchQuery, scoreQueryMatch } from "@t3tools/shared/searchRanking";

/**
 * Ranks a chat for the "Add existing chats" picker. Every query word must match the
 * title or one of the visible context labels; title hits outrank context hits, and
 * only titles allow loose (subsequence) matches. Lower is better, null means no match.
 */
export function scoreChatPickerMatch(
  title: string,
  context: ReadonlyArray<string | undefined>,
  query: string,
): number | null {
  const words = normalizeSearchQuery(query).split(/\s+/).filter(Boolean);
  const normalizedTitle = title.trim().toLowerCase();
  const labels = context.flatMap((label) => (label ? [label.trim().toLowerCase()] : []));
  let total = 0;
  for (const word of words) {
    const scores = [
      scoreQueryMatch({
        value: normalizedTitle,
        query: word,
        exactBase: 0,
        prefixBase: 10,
        boundaryBase: 100,
        includesBase: 200,
        fuzzyBase: 2_000,
      }),
      ...labels.map((label) =>
        scoreQueryMatch({
          value: label,
          query: word,
          exactBase: 500,
          prefixBase: 510,
          boundaryBase: 600,
          includesBase: 700,
        }),
      ),
    ].filter((score) => score !== null);
    if (!scores.length) return null;
    total += Math.min(...scores);
  }
  return total;
}
