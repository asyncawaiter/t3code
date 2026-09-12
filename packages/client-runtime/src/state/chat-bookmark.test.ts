import { describe, expect, it } from "vite-plus/test";
import { resolveChatFocus } from "./chat-bookmark";

describe("chat bookmark focus", () => {
  it("keeps the bookmark fixed while alternating with the latest departure chat", () => {
    const toA = resolveChatFocus("device-a:chat-a", null, "device-b:chat-b")!;
    expect(toA).toEqual({ threadKey: "device-a:chat-a", returnThreadKey: "device-b:chat-b" });
    const toB = resolveChatFocus("device-a:chat-a", toA.returnThreadKey, toA.threadKey)!;
    expect(toB).toEqual({ threadKey: "device-b:chat-b", returnThreadKey: "device-b:chat-b" });
    expect(resolveChatFocus("device-a:chat-a", toB.returnThreadKey, toB.threadKey)).toEqual(toA);
    const fromC = resolveChatFocus("device-a:chat-a", toB.returnThreadKey, "device-c:chat-c")!;
    expect(fromC).toEqual({ threadKey: "device-a:chat-a", returnThreadKey: "device-c:chat-c" });
    expect(
      resolveChatFocus("device-a:chat-a", fromC.returnThreadKey, fromC.threadKey)?.threadKey,
    ).toBe("device-c:chat-c");
  });
  it("reveals the bookmark before there is a return point and preserves it outside chats", () => {
    expect(resolveChatFocus(null, "b", "c")).toBeNull();
    expect(resolveChatFocus("a", null, "a")).toEqual({ threadKey: "a", returnThreadKey: null });
    expect(resolveChatFocus("a", "b", null)).toEqual({ threadKey: "a", returnThreadKey: "b" });
  });
});
