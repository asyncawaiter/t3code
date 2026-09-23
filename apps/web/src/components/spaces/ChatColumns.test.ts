import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, TurnId, DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import {
  moveColumn,
  columnOrder,
  columnWidth,
  boardColumnKeys,
  columnStatus,
  addChatsToBoard,
  activeSpaceChats,
} from "./ChatColumns";
it("keeps column order stable, appends new chats, and only retains explicitly chosen settled chats", () => {
  const chat = (id: string) => ({
    id: ThreadId.make(id),
    environmentId: EnvironmentId.make("device"),
    createdAt: `2026-09-${id}T00:00:00.000Z`,
    archivedAt: null,
    settledOverride: null,
  });
  const old = chat("01"),
    recent = chat("02"),
    added = chat("03");
  const layout = { order: ["device:02", "device:01"], hidden: [], kept: [] };
  expect(columnOrder([old, recent, added], layout).map((item) => item.id)).toEqual([
    "02",
    "01",
    "03",
  ]);
  expect(
    columnOrder([{ ...recent, settledOverride: "settled" }, old], layout).map((item) => item.id),
  ).toEqual(["01"]);
  expect(
    columnOrder([{ ...recent, settledOverride: "settled" }, old], {
      ...layout,
      kept: ["device:02"],
      hidden: ["device:01"],
    }).map((item) => item.id),
  ).toEqual(["02"]);
  expect(columnOrder([{ ...recent, archivedAt: "2026-09-20T00:00:00.000Z" }], layout)).toEqual([]);
  expect(
    columnOrder([{ ...recent, archivedAt: "2026-09-20T00:00:00.000Z" }], {
      ...layout,
      kept: ["device:02"],
    }).map((item) => item.id),
  ).toEqual(["02"]);
});

it("mixes explicit chats from other Spaces and devices without importing every chat", () => {
  const chat = (device: string, id: string) => ({
    environmentId: EnvironmentId.make(device),
    id: ThreadId.make(id),
    archivedAt: null,
    settledOverride: null,
    createdAt: "2026-09-20",
  });
  const local = chat("local", "one");
  const remote = chat("remote", "one");
  const unrelated = chat("remote", "two");
  const settled = { ...chat("remote", "reference"), settledOverride: "settled" as const };
  const layout = {
    order: ["remote:reference", "missing:chat", "remote:one", "local:one"],
    kept: ["remote:reference"],
    hidden: [],
  };
  expect(boardColumnKeys([local, remote, unrelated, settled], layout)).toEqual(layout.order);
  expect(
    boardColumnKeys([local, remote, unrelated, settled], {
      ...layout,
      hidden: ["remote:one"],
      kept: [],
    }),
  ).toEqual(["missing:chat", "local:one"]);
});

it("bounds independently saved widths to a usable range", () => {
  const widths = { first: columnWidth(560), second: columnWidth(380) };
  expect(widths).toEqual({ first: 560, second: 380 });
  expect(columnWidth(100)).toBe(340);
  expect(columnWidth(4000)).toBe(1000);
  expect(columnWidth(NaN)).toBe(420);
});

it("keeps conversation settlement distinct from result review and prioritizes requests for input", () => {
  const completedAt = "2026-09-23T12:00:00Z";
  const chat: Parameters<typeof columnStatus>[0] = {
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session: null,
    archivedAt: null,
    settledOverride: null,
    latestTurn: {
      turnId: TurnId.make("turn"),
      state: "completed",
      requestedAt: completedAt,
      startedAt: completedAt,
      completedAt,
      assistantMessageId: null,
    },
  };
  expect(columnStatus(chat)).toBe("Ready to review");
  expect(columnStatus(chat, completedAt)).toBe("Reviewed");
  expect(columnStatus(chat, "older-result")).toBe("Ready to review");
  expect(columnStatus({ ...chat, settledOverride: "settled" }, completedAt)).toBe("Settled");
  expect(columnStatus({ ...chat, settledOverride: "settled", hasPendingApprovals: true })).toBe(
    "Needs input",
  );
  expect(columnStatus({ ...chat, hasActionableProposedPlan: true })).toBe("Needs input");
  expect(columnStatus({ ...chat, archivedAt: completedAt })).toBe("Archived");
  expect(columnStatus({ ...chat, latestTurn: null })).toBe("Idle");
});

it("appends a batch without disturbing existing columns and retains settled references", () => {
  const board = {
    ...DEFAULT_CHAT_BOARD,
    order: ["a", "hidden", "b"],
    hidden: ["hidden"],
    kept: ["a"],
    widths: { a: 500 },
  };
  const updated = addChatsToBoard(board, [
    { key: "hidden", title: "Returning chat", context: "POD", settled: false },
    { key: "reference", title: "Reference", context: "Evals", settled: true },
  ]);
  expect(updated.order).toEqual(["a", "b", "hidden", "reference"]);
  expect(updated.hidden).toEqual([]);
  expect(updated.kept).toEqual(["a", "reference"]);
  expect(updated.widths).toEqual({ a: 500 });
  expect(updated.labels?.reference).toEqual({ title: "Reference", context: "Evals" });
  expect(board.order).toEqual(["a", "hidden", "b"]);
  expect(board.hidden).toEqual(["hidden"]);
  expect(addChatsToBoard(board, [])).toEqual(board);
});

it("space membership includes idle and reviewed chats, excludes parked chats, and wakes expired snoozes", () => {
  const idle = { id: "idle", archivedAt: null, settledOverride: null };
  const reviewed = { ...idle, id: "reviewed" };
  const settled = { ...idle, id: "settled", settledOverride: "settled" as const };
  const archived = { ...idle, id: "archived", archivedAt: "2026-09-23" };
  const snoozed = { ...idle, id: "snoozed", snoozedUntil: "2026-09-24T00:00:00Z" };
  const expired = { ...idle, id: "expired", snoozedUntil: "2026-09-22T00:00:00Z" };
  expect(
    activeSpaceChats(
      [idle, reviewed, settled, archived, snoozed, expired],
      Date.parse("2026-09-23"),
    ),
  ).toEqual([idle, reviewed, expired]);
  expect(activeSpaceChats([snoozed], Date.parse("2026-09-24"))).toEqual([snoozed]);
});

it("moves a column across multiple positions without losing other or hidden columns", () => {
  const order = ["a", "hidden", "b", "c"];
  expect(moveColumn(order, "a", "c")).toEqual(["hidden", "b", "c", "a"]);
  expect(moveColumn(order, "c", "a")).toEqual(["c", "a", "hidden", "b"]);
  expect(moveColumn(order, "missing", "a")).toBe(order);
  expect(moveColumn(order, "a", "missing")).toBe(order);
  expect(moveColumn(order, "a", "a")).toBe(order);
  expect(order).toEqual(["a", "hidden", "b", "c"]);
});
