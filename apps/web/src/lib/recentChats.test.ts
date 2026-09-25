import { beforeEach, expect, it } from "vite-plus/test";

import { recentChatTarget, recordChatUse, releaseChat, resetRecentChats } from "./recentChats";

beforeEach(() => resetRecentChats());

it("flips between the two most recent chats while one is showing", () => {
  recordChatUse("a");
  recordChatUse("b");
  expect(recentChatTarget()).toBe("a");
  recordChatUse("a");
  expect(recentChatTarget()).toBe("b");
});

it("returns to the latest chat from a page without one", () => {
  recordChatUse("a");
  recordChatUse("b");
  releaseChat("b");
  expect(recentChatTarget()).toBe("b");
});

it("has nowhere to go without history", () => {
  expect(recentChatTarget()).toBeNull();
  recordChatUse("only");
  expect(recentChatTarget()).toBeNull();
});
