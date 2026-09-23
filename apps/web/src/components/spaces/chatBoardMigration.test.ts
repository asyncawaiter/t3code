import { expect, it } from "vite-plus/test";
import { DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import { readLegacyChatBoards, visibleChatBoards } from "./chatBoardMigration";

it("imports each local arrangement once without removing old keys or unavailable chats", () => {
  const data = new Map<string, string>([
    [
      "t3.chat-columns.work:space",
      JSON.stringify({ order: ["offline:a", "godel:b"], hidden: ["godel:b"], kept: ["offline:a"] }),
    ],
    ["t3.chat-columns.added.work:space", JSON.stringify(["poly:c"])],
    ["t3.chat-columns.widths.work:space", JSON.stringify({ "offline:a": 580 })],
    ["t3.chat-columns.scroll.work:space", "40"],
  ]);
  const storage: Storage = {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
  const first = readLegacyChatBoards(storage, []);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    order: ["offline:a", "godel:b", "poly:c"],
    hidden: ["godel:b"],
    kept: ["offline:a"],
    widths: { "offline:a": 580 },
  });
  expect(readLegacyChatBoards(storage, [])).toEqual(first);
  expect(storage.getItem("t3.chat-columns.work:space")).not.toBeNull();
  storage.setItem(
    "t3.chat-columns.empty:null",
    JSON.stringify({ order: [], hidden: [], kept: [] }),
  );
  expect(readLegacyChatBoards(storage, [])).toEqual(first);
  storage.setItem(
    "t3.chat-columns.kept:null",
    JSON.stringify({ order: [], hidden: [], kept: ["offline:kept"] }),
  );
  expect(
    readLegacyChatBoards(storage, []).find((board) => board.kept.includes("offline:kept"))?.order,
  ).toEqual(["offline:kept"]);
  storage.setItem("t3.chat-columns.other:null", "broken");
  expect(() => readLegacyChatBoards(storage, [])).toThrow();
  expect(storage.getItem("t3.chat-columns.other:null")).toBe("broken");
});

it("shows distinct recovered arrangements without empty imports or cross-device duplicates", () => {
  const one = {
    ...DEFAULT_CHAT_BOARD,
    id: "import-one",
    name: "Imported POD",
    order: ["poly:a"],
    widths: { "poly:a": 480 },
  };
  const otherDevice = { ...one, id: "import-two", name: "Imported Vedara" };
  const resized = { ...one, id: "import-resized", widths: { "poly:a": 600 } };
  const empty = { ...DEFAULT_CHAT_BOARD, id: "import-empty", name: "Imported Evals" };
  const custom = { ...one, id: "named", name: "My review" };
  const records = [empty, one, otherDevice, resized, DEFAULT_CHAT_BOARD, custom];
  expect(visibleChatBoards(records).map((board) => board.id)).toEqual([
    "default",
    "named",
    "import-resized",
  ]);
  expect(records).toHaveLength(6);
  expect(visibleChatBoards([{ ...empty, name: "My saved empty board" }])).toHaveLength(1);
  expect(visibleChatBoards([one, otherDevice]).map((board) => board.id)).toEqual(["import-one"]);
  expect(
    visibleChatBoards([one, { ...one, id: "import-hidden", hidden: ["poly:a"] }]),
  ).toHaveLength(2);
});
