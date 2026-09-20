import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { WorkItem, mergeWorkItems, workItemPrompt } from "./workItem.ts";
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
    expect(() => mergeWorkItems([first], [first], [])).toThrow("Complete tasks");
    expect(mergeWorkItems([first], [], [first])).toEqual([first]);
  });
});
