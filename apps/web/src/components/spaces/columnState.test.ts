import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  assignHints,
  boardOverviewTiles,
  chatsNeedingInput,
  moveChatBetweenBoards,
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
