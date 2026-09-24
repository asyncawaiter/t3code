import { beforeEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_CHAT_BOARD, EnvironmentId, ThreadId } from "@t3tools/contracts";
const state = vi.hoisted(() => ({
  locations: {},
  boards: [{}],
  assigned: true,
  unavailable: null as string | null,
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({ sourceId: "device" }) }));
vi.mock("../state/server", () => ({ profileSourceAtom: {} }));
vi.mock("./useLocalStorage", () => ({ useLocalStorage: () => [state.locations, vi.fn()] }));
vi.mock("./useChatBoards", () => ({
  useChatBoards: () => ({ boards: state.boards, unavailable: state.unavailable }),
}));
vi.mock("../state/entities", () => ({
  readThreadShell: () => ({ id: "chat", projectId: "project" }),
}));
vi.mock("./useSettings", () => ({
  usePrimarySettings: () =>
    state.assigned
      ? [
          {
            id: "work",
            name: "Work",
            projectKeys: ["device:project"],
            spaces: [
              {
                id: "pod",
                name: "POD",
                threads: [{ threadKey: "device:chat", projectKey: "device:project" }],
              },
            ],
          },
        ]
      : [],
}));
import { useChatColumnLocation, rememberColumnLocation } from "./useChatColumnLocation";
const target = { environmentId: EnvironmentId.make("device"), threadId: ThreadId.make("chat") };
beforeEach(() => {
  state.assigned = true;
  state.unavailable = null;
  state.locations = { "device:chat": { kind: "board", boardId: "custom" } };
  state.boards = [{ ...DEFAULT_CHAT_BOARD, id: "custom", name: "Release", order: ["device:chat"] }];
});
it("returns the last used custom board even when another board contains the chat", () => {
  state.boards.unshift({ ...DEFAULT_CHAT_BOARD, order: ["device:chat"] });
  expect(useChatColumnLocation()(target)).toMatchObject({
    label: "Board · Release",
    navigation: { search: { board: "custom", workspace: "board", focus: "device:chat" } },
  });
});
it.each(["deleted", "removed", "hidden"])(
  "falls back to the owning space when the board is %s",
  (reason) => {
    state.boards =
      reason === "deleted"
        ? []
        : [
            {
              ...DEFAULT_CHAT_BOARD,
              id: "custom",
              order: reason === "removed" ? [] : ["device:chat"],
              hidden: reason === "hidden" ? ["device:chat"] : [],
            },
          ];
    expect(useChatColumnLocation()(target)).toMatchObject({
      label: "Space · POD",
      navigation: { search: { workspace: "space", space: "pod" } },
    });
  },
);
it("preserves a deliberate All chats location", () => {
  state.locations = { "device:chat": { kind: "space", profileId: "all", unsorted: false } };
  expect(useChatColumnLocation()(target)).toMatchObject({
    label: "All chats",
    navigation: { params: { profileId: "all" } },
  });
});
it("discards a deleted space destination", () => {
  state.locations = {
    "device:chat": { kind: "space", profileId: "work", spaceId: "gone", unsorted: false },
  };
  expect(useChatColumnLocation()(target).label).toBe("Space · POD");
});

it("falls back to All chats when no owning profile remains", () => {
  state.boards = [];
  state.assigned = false;
  expect(useChatColumnLocation()(target)).toMatchObject({
    label: "All chats",
    navigation: { params: { profileId: "all" }, search: { workspace: "space", unsorted: false } },
  });
});
it("uses the last Space even when the chat belongs to custom boards", () => {
  state.locations = {
    "device:chat": { kind: "space", profileId: "work", spaceId: "pod", unsorted: false },
  };
  expect(useChatColumnLocation()(target).label).toBe("Space · POD");
});

it("only offers existing memberships and marks the last-used destination", () => {
  state.boards.push({ ...DEFAULT_CHAT_BOARD, id: "unrelated", order: [] });
  const result = useChatColumnLocation()(target);
  expect(result.choices.map((choice) => [choice.label, choice.lastUsed])).toEqual([
    ["Space · POD", false],
    ["Board · Release", true],
    ["All chats", false],
  ]);
  expect(result.tooltip).toBe("Last used here. Click to return.");
});
it("explains removal, and distinguishes a fallback from last use", () => {
  state.boards = [];
  state.locations = { "device:chat": { kind: "board", boardId: "gone", boardName: "Release" } };
  expect(useChatColumnLocation()(target)).toMatchObject({
    fallback: "Release is no longer available.",
    tooltip: "Opens in this Space.",
  });
});
it("does not treat missing offline board data as deletion", () => {
  state.boards = [];
  state.unavailable = "Offline";
  expect(useChatColumnLocation()(target)).toMatchObject({
    blocked: expect.any(String),
    navigation: { search: { board: "custom" } },
  });
});
it("validates a requested board against current membership", () => {
  const result = useChatColumnLocation()(target, { kind: "board", boardId: "foreign" });
  expect(result.navigation.search.workspace).toBe("space");
  expect(state.boards).toHaveLength(1);
});
it("moves draft location memory across a device reassignment without losing other chats", () => {
  const location = { kind: "board" as const, boardId: "custom" };
  const previous = { "old:draft": location, "other:chat": location };
  expect(rememberColumnLocation(previous, "new:draft", location, "old:draft")).toEqual({
    "new:draft": location,
    "other:chat": location,
  });
  expect(previous["old:draft"]).toBe(location);
});
