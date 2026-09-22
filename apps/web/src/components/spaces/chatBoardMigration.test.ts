import { expect, it } from "vite-plus/test";
import { readLegacyChatBoards } from "./chatBoardMigration";

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
  storage.setItem("t3.chat-columns.other:null", "broken");
  expect(() => readLegacyChatBoards(storage, [])).toThrow();
  expect(storage.getItem("t3.chat-columns.other:null")).toBe("broken");
});
