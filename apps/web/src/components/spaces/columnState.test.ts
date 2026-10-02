import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  assignHints,
  boardOverviewTiles,
  chatsNeedingInput,
  moveChatBetweenBoards,
  shiftChatInBoard,
  stepCursor,
  storedHints,
} from "./columnState";

const chat = (id: string, extra: Partial<EnvironmentThreadShell> = {}) =>
  ({
    id: ThreadId.make(id),
    environmentId: EnvironmentId.make("device"),
    title: `Chat ${id}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session: null,
    latestTurn: null,
    ...extra,
  }) as EnvironmentThreadShell;

it("lists each board's visible columns in order and counts each waiting chat once", () => {
  const work = {
    ...DEFAULT_CHAT_BOARD,
    order: ["device:b", "device:a", "device:settled", "device:hidden"],
    hidden: ["device:hidden"],
  };
  const side = {
    ...DEFAULT_CHAT_BOARD,
    id: "side",
    name: "Side",
    order: ["device:gone", "device:a"],
    labels: { "device:gone": { title: "Old title", context: "" } },
  };
  const tiles = boardOverviewTiles(
    [work, side],
    [
      chat("a", { hasPendingUserInput: true }),
      chat("b"),
      chat("settled", { settledOverride: "settled" }),
      chat("hidden"),
    ],
    {},
  );
  expect(tiles.map((tile) => tile.chats.map(({ title, status }) => [title, status]))).toEqual([
    [
      ["Chat b", "Idle"],
      ["Chat a", "Needs input"],
    ],
    // A chat whose device is offline keeps its saved title and gets no live status.
    [
      ["Old title", null],
      ["Chat a", "Needs input"],
    ],
  ]);
  expect(chatsNeedingInput(tiles).map(({ board }) => board.id)).toEqual(["default"]);
});

it("keeps hints stable while slots stay and hands freed letters to new slots", () => {
  const first = assignHints({}, ["x|1", "x|2", "x|3"]);
  expect(first).toEqual({ "x|1": "a", "x|2": "s", "x|3": "d" });
  // Removing the middle chat frees its letter without shifting the others.
  const second = assignHints(first, ["x|1", "x|3", "y|4"]);
  expect(second).toEqual({ "x|1": "a", "x|3": "d", "y|4": "s" });
});

it("moves a chat between boards with its label, width and kept state", () => {
  const from = {
    ...DEFAULT_CHAT_BOARD,
    order: ["k", "other"],
    kept: ["k"],
    widths: { k: 500 },
    labels: { k: { title: "T", context: "C" } },
  };
  const to = { ...DEFAULT_CHAT_BOARD, id: "to", order: ["z"] };
  const { source, target } = moveChatBetweenBoards(from, to, "k");
  expect(source).toMatchObject({ order: ["other"], kept: [], widths: {}, labels: {} });
  expect(target).toMatchObject({
    order: ["z", "k"],
    kept: ["k"],
    widths: { k: 500 },
    labels: { k: { title: "T", context: "C" } },
  });
});

it("keeps a kept chat visible when moved onto a board that lists it but hides it", () => {
  const from = { ...DEFAULT_CHAT_BOARD, order: ["device:x"], kept: ["device:x"] };
  const to = { ...DEFAULT_CHAT_BOARD, id: "to", order: ["device:x"] };
  const { target } = moveChatBetweenBoards(from, to, "device:x");
  const archived = chat("x", { archivedAt: "2026-09-02T00:00:00.000Z" });
  expect(boardOverviewTiles([target], [archived], {})[0]!.chats.map((item) => item.key)).toEqual([
    "device:x",
  ]);
});

it("walks the cursor within a board and between non-empty boards", () => {
  const tiles = [
    { board: { id: "one" }, chats: [{ slot: "1a" }, { slot: "1b" }, { slot: "1c" }] },
    { board: { id: "empty" }, chats: [] },
    { board: { id: "two" }, chats: [{ slot: "2a" }] },
  ];
  expect(stepCursor(tiles, null, "right", "two")).toBe("2a");
  expect(stepCursor(tiles, "1a", "right", null)).toBe("1b");
  expect(stepCursor(tiles, "1a", "left", null)).toBe("1a");
  // Down skips the empty board and clamps to the last chat there.
  expect(stepCursor(tiles, "1c", "down", null)).toBe("2a");
  expect(stepCursor(tiles, "2a", "down", null)).toBe("2a");
});

it("swaps a chat with its visible neighbour, skipping hidden ones", () => {
  const board = { ...DEFAULT_CHAT_BOARD, order: ["a", "hidden", "b"], hidden: ["hidden"] };
  expect(shiftChatInBoard(board, ["a", "b"], "a", "right")?.order).toEqual(["b", "hidden", "a"]);
  expect(shiftChatInBoard(board, ["a", "b"], "a", "left")).toBeNull();
  // A chat that already left the board (a move still saving) is never written back as a hole.
  expect(shiftChatInBoard(board, ["a", "gone", "b"], "gone", "right")).toBeNull();
});

it("stores freed letters for other windows' slots without duplicating a letter", () => {
  const stored = { "x|1": "a", "x|2": "s", "y|9": "d" };
  // This window sees x|1 and a new slot that took the letter y|9 used to hold.
  expect(storedHints(stored, { "x|1": "a", "z|3": "d" })).toEqual({
    "x|2": "s",
    "x|1": "a",
    "z|3": "d",
  });
});

it("lists a key the board saved twice as one column and marks local drafts", () => {
  const board = { ...DEFAULT_CHAT_BOARD, order: ["device:a", "device:draft", "device:a"] };
  const [tile] = boardOverviewTiles([board], [chat("a")], {}, new Set(["device:draft"]));
  expect(tile!.chats.map(({ key, status }) => [key, status])).toEqual([
    ["device:a", "Idle"],
    ["device:draft", "Draft"],
  ]);
});
