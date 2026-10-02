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
  // Imported or legacy boards can list a key twice; it is still one column.
  return [...new Set(layout.order)].filter(
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

/** Home row first, so the most common jumps need the least reach. H, J, K and L move the cursor. */
export const HINTS = "asdfgqweruioptyzxcvbnm1234567890";

/** One overview slot: a chat as it appears on one board. A chat on two boards has two slots. */
export const slotId = (boardId: string, key: string) => `${boardId}|${key}`;
/** The board and chat a slot names; chat keys never contain "|". */
export function parseSlot(slot: string) {
  const at = slot.indexOf("|");
  return { boardId: slot.slice(0, at), key: slot.slice(at + 1) };
}

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

/**
 * What to store after assigning: the live hints plus every earlier slot whose letter is still
 * free. Another window seeing other slots then keeps its letters instead of fighting over them.
 * Each letter appears once, so the record never outgrows HINTS.
 */
export function storedHints(
  previous: Readonly<Record<string, string>>,
  hints: Readonly<Record<string, string>>,
): Record<string, string> {
  const used = new Set(Object.values(hints));
  const kept: Record<string, string> = {};
  for (const [slot, hint] of Object.entries(previous)) {
    if (slot in hints || used.has(hint) || !HINTS.includes(hint)) continue;
    kept[slot] = hint;
    used.add(hint);
  }
  return { ...kept, ...hints };
}

/** A board's visible column keys, given the chat shells this client knows. */
export function boardChatKeys(board: ChatBoard, shells: readonly EnvironmentThreadShell[]) {
  const members = shells.filter((shell) => board.order.includes(keyOf(shell)));
  return boardColumnKeys(members, board);
}

/** Each board's visible columns in board order, as the overview and the rail badge read them. */
export function boardOverviewTiles(
  boards: readonly ChatBoard[],
  shells: readonly EnvironmentThreadShell[],
  reviewed: Readonly<Record<string, string>>,
  /** Keys of this client's unsent drafts, which have no shell yet. */
  drafts: ReadonlySet<string> = new Set(),
) {
  const byKey = new Map(shells.map((shell) => [keyOf(shell), shell]));
  return boards.map((board) => {
    return {
      board,
      chats: boardChatKeys(board, shells).map((key) => {
        const chat = byKey.get(key);
        return {
          key,
          slot: slotId(board.id, key),
          title: chat?.title ?? board.labels?.[key]?.title ?? "Unavailable chat",
          /** Where the chat lives, as saved when it joined the board ("Profile / Space / Folder / Device"). */
          context: board.labels?.[key]?.context || null,
          // Chats on offline devices have no live state to report.
          status: chat ? columnStatus(chat, reviewed[key]) : drafts.has(key) ? "Draft" : null,
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

export type CursorStep = "left" | "right" | "up" | "down";

/**
 * Moves the overview cursor: left and right within a board, up and down to the neighbouring
 * non-empty board at the same position (clamped). With no cursor yet, starts on `start`'s first chat.
 */
export function stepCursor(
  tiles: readonly { board: { id: string }; chats: readonly { slot: string }[] }[],
  cursor: string | null,
  step: CursorStep,
  start: string | null,
) {
  const rows = tiles.filter((tile) => tile.chats.length > 0);
  const row = rows.findIndex((tile) => tile.chats.some((chat) => chat.slot === cursor));
  if (row < 0) {
    const first = rows.find((tile) => tile.board.id === start) ?? rows[0];
    return first?.chats[0]?.slot ?? null;
  }
  const chats = rows[row]!.chats;
  const column = chats.findIndex((chat) => chat.slot === cursor);
  if (step === "left") return chats[Math.max(0, column - 1)]!.slot;
  if (step === "right") return chats[Math.min(chats.length - 1, column + 1)]!.slot;
  const next = rows[row + (step === "down" ? 1 : -1)];
  if (!next) return cursor;
  return next.chats[Math.min(column, next.chats.length - 1)]!.slot;
}

/** Swaps a chat with its visible neighbour in the board's saved order; null at either end. */
export function shiftChatInBoard(
  board: ChatBoard,
  visible: readonly string[],
  key: string,
  step: "left" | "right",
) {
  const index = visible.indexOf(key);
  const neighbour = visible[index + (step === "left" ? -1 : 1)];
  const order = [...board.order];
  const a = order.indexOf(key);
  const b = neighbour === undefined ? -1 : order.indexOf(neighbour);
  if (index < 0 || a < 0 || b < 0) return null;
  [order[a], order[b]] = [order[b]!, order[a]!];
  return { ...board, order };
}
