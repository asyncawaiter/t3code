import type { ChatBoard } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

type BoardLayout = Pick<ChatBoard, "order" | "hidden" | "kept">;
type StatusFields = Pick<
  EnvironmentThreadShell,
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "hasActionableProposedPlan"
  | "session"
  | "archivedAt"
  | "settledOverride"
  | "latestTurn"
>;

const keyOf = (chat: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  `${chat.environmentId}:${chat.id}`;

export function columnOrder<
  T extends Pick<
    EnvironmentThreadShell,
    "environmentId" | "id" | "archivedAt" | "settledOverride" | "createdAt"
  >,
>(chats: readonly T[], layout: BoardLayout) {
  const eligible = chats.filter(
    (chat) =>
      (!chat.archivedAt || layout.kept.includes(keyOf(chat))) &&
      !layout.hidden.includes(keyOf(chat)) &&
      (chat.settledOverride !== "settled" || layout.kept.includes(keyOf(chat))),
  );
  const byKey = new Map(eligible.map((chat) => [keyOf(chat), chat]));
  return [
    ...new Set([
      ...layout.order,
      ...eligible.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map(keyOf),
    ]),
  ].flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
}

export function boardColumnKeys(chats: Parameters<typeof columnOrder>[0], layout: BoardLayout) {
  const visible = new Set(columnOrder(chats, layout).map(keyOf));
  const known = new Set(chats.map(keyOf));
  return layout.order.filter(
    (key) => !layout.hidden.includes(key) && (visible.has(key) || !known.has(key)),
  );
}

export function columnStatus(chat: StatusFields, reviewedAt?: string) {
  if (chat.hasPendingApprovals || chat.hasPendingUserInput || chat.hasActionableProposedPlan)
    return "Needs input";
  if (chat.session?.status === "running") return "Running";
  if (chat.archivedAt) return "Archived";
  if (chat.settledOverride === "settled") return "Settled";
  if (chat.latestTurn?.state === "completed" && chat.latestTurn.completedAt) {
    return reviewedAt === chat.latestTurn.completedAt ? "Reviewed" : "Ready to review";
  }
  return "Idle";
}

/** Home row first, so the most common jumps need the least reach. */
export const HINTS = "asdfjklghqweruioptyzxcvbnm1234567890";

/** One overview slot: a chat as it appears on one board. A chat on two boards has two slots. */
export const slotId = (boardId: string, key: string) => `${boardId}|${key}`;

/**
 * Keeps every slot's letter while it stays on its board, so hints become muscle memory.
 * Freed letters go to new slots in board order; slots past the last letter get none.
 */
export function assignHints(
  previous: Readonly<Record<string, string>>,
  slots: readonly string[],
): Record<string, string> {
  const live = new Set(slots);
  const hints: Record<string, string> = {};
  const used = new Set<string>();
  for (const [slot, hint] of Object.entries(previous)) {
    if (!live.has(slot) || !HINTS.includes(hint) || used.has(hint)) continue;
    hints[slot] = hint;
    used.add(hint);
  }
  const free = [...HINTS].filter((hint) => !used.has(hint));
  for (const slot of slots) if (!hints[slot] && free.length) hints[slot] = free.shift()!;
  return hints;
}

/** Each board's visible columns in board order, as the overview and the rail badge read them. */
export function boardOverviewTiles(
  boards: readonly ChatBoard[],
  shells: readonly EnvironmentThreadShell[],
  reviewed: Readonly<Record<string, string>>,
) {
  const byKey = new Map(shells.map((shell) => [keyOf(shell), shell]));
  return boards.map((board) => {
    const members = board.order.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
    return {
      board,
      chats: boardColumnKeys(members, board).map((key) => {
        const chat = byKey.get(key);
        return {
          key,
          slot: slotId(board.id, key),
          title: chat?.title ?? board.labels?.[key]?.title ?? "Unavailable chat",
          // Drafts and chats on offline devices have no live state to report.
          status: chat ? columnStatus(chat, reviewed[key]) : null,
          runningSince:
            chat?.session?.status === "running"
              ? (chat.latestTurn?.startedAt ?? chat.latestTurn?.requestedAt ?? null)
              : null,
        };
      }),
    };
  });
}

/** Distinct chats waiting on the user across every board. */
export function chatsNeedingInput(tiles: ReturnType<typeof boardOverviewTiles>) {
  const seen = new Set<string>();
  return tiles.flatMap(({ board, chats }) =>
    chats.flatMap((chat) => {
      if (chat.status !== "Needs input" || seen.has(chat.key)) return [];
      seen.add(chat.key);
      return [{ board, chat }];
    }),
  );
}

/** Moves a chat to another board, keeping its label, width and kept state. */
export function moveChatBetweenBoards(from: ChatBoard, to: ChatBoard, key: string) {
  const { [key]: width, ...widths } = from.widths;
  const { [key]: label, ...labels } = from.labels ?? {};
  const source = {
    ...from,
    order: from.order.filter((item) => item !== key),
    hidden: from.hidden.filter((item) => item !== key),
    kept: from.kept.filter((item) => item !== key),
    widths,
    ...(from.labels ? { labels } : {}),
  };
  // The target may already list the chat but not show it (archived, not kept), so merge anyway.
  const target = {
    ...to,
    order: [...new Set([...to.order, key])],
    hidden: to.hidden.filter((item) => item !== key),
    kept: from.kept.includes(key) ? [...new Set([...to.kept, key])] : to.kept,
    widths: width === undefined || key in to.widths ? to.widths : { ...to.widths, [key]: width },
    ...(label && !to.labels?.[key] ? { labels: { ...to.labels, [key]: label } } : {}),
  };
  return { source, target };
}
