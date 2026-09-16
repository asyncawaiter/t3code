import { describe, expect, it } from "vite-plus/test";
import { mergeProfileEdits, moveThreadsToSpace, type Profile } from "@t3tools/contracts";
import { organizationChangeLabel } from "./profileUndo";

const first = { threadKey: "env:first", projectKey: "env:project" };
const second = { threadKey: "env:second", projectKey: "env:project" };
const profile: Profile = {
  id: "work",
  name: "Work",
  color: "blue",
  projectKeys: ["env:project"],
  spaces: [
    { id: "a", name: "Build", threads: [first] },
    { id: "b", name: "Review", threads: [] },
  ],
};

describe("placement undo", () => {
  it("names the destination and preserves unrelated later moves when undoing", () => {
    const after = moveThreadsToSpace(profile, [first], "b");
    expect(organizationChangeLabel([profile], [after])).toBe("Moved to Work / Review");
    expect(organizationChangeLabel([profile], [moveThreadsToSpace(profile, [first], null)])).toBe(
      "Moved to Work / Unsorted",
    );
    const later = moveThreadsToSpace(after, [second], "b");
    const restored = mergeProfileEdits([later], [after], [profile]);
    expect(restored[0]?.spaces?.[0]?.threads).toEqual([first]);
    expect(restored[0]?.spaces?.[1]?.threads).toEqual([second]);
  });
  it("confirms project assignment and removal", () => {
    expect(organizationChangeLabel([], [profile])).toBe("Moved project to Work");
    expect(organizationChangeLabel([profile], [{ ...profile, projectKeys: [], spaces: [] }])).toBe(
      "Moved project to All / Unassigned",
    );
  });
  it("refuses undo when the same chat has since moved somewhere else", () => {
    const before = {
      ...profile,
      spaces: [...profile.spaces!, { id: "c", name: "Later", threads: [] }],
    };
    const after = moveThreadsToSpace(before, [first], "b");
    const later = moveThreadsToSpace(after, [first], "c");
    expect(() => mergeProfileEdits([later], [after], [before])).toThrow();
  });
});
