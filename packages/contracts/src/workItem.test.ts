import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "./baseSchemas.ts";
import * as Schema from "effect/Schema";
import {
  WorkItem,
  mergeWorkItems,
  workItemPrompt,
  workItemChats,
  workItemPreparationThread,
  workItemTitle,
} from "./workItem.ts";
const decodeTask = Schema.decodeUnknownSync(WorkItem);
const task = (id: string): WorkItem => ({
  id,
  title: "Request from a call",
  notes: "Keep the original request",
  brief: "",
  status: "parked",
  profileId: null,
  spaceId: null,
  projectId: null,
  source: null,
  threadId: null,
  links: [],
  createdAt: "2026-09-20T12:00:00.000Z",
  updatedAt: "2026-09-20T12:00:00.000Z",
});
describe("durable tasks", () => {
  it("accepts standalone work without requiring a chat, folder, or Space", () => {
    expect(decodeTask(task("one"))).toEqual(task("one"));
    expect(
      workItemPrompt({
        ...task("one"),
        brief: "First step",
        links: ["https://example.com/request"],
      }),
    ).toContain("Original request:\nKeep the original request");
  });
  it("merges independent edits and refuses stale writes, duplicate IDs and removals", () => {
    const first = task("one"),
      second = task("two");
    expect(
      mergeWorkItems(
        [first],
        [JSON.parse(JSON.stringify(first))],
        [{ ...first, title: "Transport copy" }],
      )[0]?.title,
    ).toBe("Transport copy");
    const changed = { ...first, notes: "Changed on another device" };
    expect(mergeWorkItems([changed, second], [second], [{ ...second, status: "done" }])).toEqual([
      changed,
      { ...second, status: "done" },
    ]);
    expect(() => mergeWorkItems([changed], [first], [{ ...first, title: "Stale" }])).toThrow(
      "changed",
    );
    expect(() => mergeWorkItems([], [], [first, first])).toThrow("unique");
    expect(() => mergeWorkItems([first], [first], [])).toThrow("Trash");
    expect(mergeWorkItems([first], [], [first])).toEqual([first]);
  });
});

it("keeps trash recoverable, retains chat links, and rejects stale restoration", () => {
  const original = { ...task("trash"), threadId: ThreadId.make("existing") };
  const deleted = { ...original, deletedAt: "2026-09-22T12:00:00.000Z" };
  expect(mergeWorkItems([original], [original], [deleted])[0]).toEqual(deleted);
  expect(mergeWorkItems([deleted], [deleted], [{ ...deleted, deletedAt: null }])[0]?.threadId).toBe(
    "existing",
  );
  expect(() => mergeWorkItems([deleted], [original], [original])).not.toThrow();
  expect(() =>
    mergeWorkItems([deleted], [original], [{ ...original, notes: "stale edit" }]),
  ).toThrow("changed");
});
it("keeps execution independent from storage and allows a replacement preparation chat", () => {
  const owner = EnvironmentId.make("godel"),
    remote = EnvironmentId.make("poly");
  const item = {
    ...task("links"),
    executionEnvironmentId: remote,
    threadId: ThreadId.make("worker"),
    source: { environmentId: owner, threadId: ThreadId.make("original") },
    preparationThreadId: ThreadId.make("replacement"),
    chats: [{ environmentId: owner, threadId: ThreadId.make("reviewer"), purpose: "Review" }],
  };
  expect(workItemChats(item, owner).map((chat) => [chat.environmentId, chat.threadId])).toEqual([
    [remote, "worker"],
    [owner, "reviewer"],
  ]);
  expect(workItemPreparationThread(item)).toBe("replacement");
  expect(workItemPreparationThread({ ...item, preparationThreadId: null })).toBeNull();
  expect(workItemTitle("\n  Fix opening hours\nOriginal Slack message")).toBe("Fix opening hours");
  expect(workItemTitle("", 1)).toBe("Screenshot or file to review");
});
