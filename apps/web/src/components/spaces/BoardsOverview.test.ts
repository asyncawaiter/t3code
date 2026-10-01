import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { boardOverviewTiles } from "./BoardsOverview";

it("lists each board's visible columns in order, with hints running across boards", () => {
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
  const work = {
    ...DEFAULT_CHAT_BOARD,
    order: ["device:b", "device:a", "device:settled", "device:hidden"],
    hidden: ["device:hidden"],
  };
  const side = {
    ...DEFAULT_CHAT_BOARD,
    id: "side",
    name: "Side",
    order: ["device:gone"],
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
  expect(tiles.map((tile) => tile.chats)).toEqual([
    [
      { key: "device:b", title: "Chat b", status: "Idle", hint: "a" },
      { key: "device:a", title: "Chat a", status: "Needs input", hint: "s" },
    ],
    // A chat whose device is offline keeps its saved title and gets no live status.
    [{ key: "device:gone", title: "Old title", status: null, hint: "d" }],
  ]);
});
