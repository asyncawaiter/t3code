import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ChatBoard, DEFAULT_CHAT_BOARD, mergeChatBoards } from "./chatBoard.ts";

it("preserves independent boards and rejects conflicting edits without losing the saved arrangement", () => {
  const first = { ...DEFAULT_CHAT_BOARD, order: ["godel:a", "poly:b"], widths: { "poly:b": 560 } };
  const second = { ...DEFAULT_CHAT_BOARD, id: "second", name: "Review" };
  const live = mergeChatBoards([first], [], [second]);
  expect(live).toEqual([first, second]);
  expect(mergeChatBoards(live, [second], [{ ...second, name: "Release" }])).toEqual([
    first,
    { ...second, name: "Release" },
  ]);
  expect(() => mergeChatBoards(live, [DEFAULT_CHAT_BOARD], [{ ...first, name: "Stale" }])).toThrow(
    "another device",
  );
  expect(mergeChatBoards(live, [second], [])).toEqual([first]);
  expect(() => mergeChatBoards(live, [first], [])).toThrow("default");
  expect(mergeChatBoards(live, [], [JSON.parse(JSON.stringify(first))])).toEqual(live);
});
it("validates names, widths and duplicate board identities at the boundary", () => {
  expect(() => Schema.decodeUnknownSync(ChatBoard)({ ...DEFAULT_CHAT_BOARD, name: " " })).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(ChatBoard)({ ...DEFAULT_CHAT_BOARD, widths: { chat: NaN } }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(ChatBoard)({ ...DEFAULT_CHAT_BOARD, widths: { chat: 1200 } }),
  ).toThrow();
  expect(() => mergeChatBoards([], [], [DEFAULT_CHAT_BOARD, DEFAULT_CHAT_BOARD])).toThrow("unique");
});
