import { describe, expect, it } from "vite-plus/test";
import { groupSidebarChats, recentSidebarChats } from "./chatGrouping";

describe("All chats grouping", () => {
  const chats = [
    {
      id: "same-id",
      environmentId: "work",
      space: "p1/pod",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-14T00:00:00Z",
      latestUserMessageAt: "2026-09-13T00:00:00Z",
    },
    {
      id: "same-id",
      environmentId: "home",
      space: "p1/evals",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-14T00:00:00Z",
      latestUserMessageAt: "2026-09-15T00:00:00Z",
    },
    {
      id: "other",
      environmentId: "home",
      space: "p1/pod",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-14T00:00:00Z",
      latestUserMessageAt: "2026-09-14T00:00:00Z",
    },
    {
      id: "unsorted",
      environmentId: "work",
      space: "unsorted",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-14T00:00:00Z",
      latestUserMessageAt: "2026-09-12T00:00:00Z",
    },
  ];
  it("sorts Recent across devices by conversation activity without mutating the input", () => {
    expect(recentSidebarChats(chats)).toEqual([chats[1], chats[2], chats[0], chats[3]]);
    expect(chats[0]!.environmentId).toBe("work");
  });
  it("groups by either dimension without losing chats or their other identity", () => {
    const recent = recentSidebarChats(chats);
    expect(groupSidebarChats(recent, (chat) => chat.environmentId)).toEqual([
      chats[1],
      chats[2],
      chats[0],
      chats[3],
    ]);
    expect(groupSidebarChats(recent, (chat) => chat.space)).toEqual([
      chats[1],
      chats[2],
      chats[0],
      chats[3],
    ]);
    expect(groupSidebarChats([chats[0]!, chats[1]!, chats[2]!], (chat) => chat.space)).toEqual([
      chats[0],
      chats[2],
      chats[1],
    ]);
  });
  it("keeps distinct profile spaces separate and accepts an empty list", () => {
    const rows = [{ space: "p1/pod" }, { space: "p2/pod" }, { space: "p1/pod" }];
    expect(groupSidebarChats(rows, (row) => row.space)).toEqual([rows[0], rows[2], rows[1]]);
    expect(groupSidebarChats([], () => "")).toEqual([]);
  });
});
