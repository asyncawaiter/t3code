import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { Profile, moveThreadsToSpace, spaceForThread } from "@t3tools/contracts";
import { moveProjectToProfile } from "../settings/ProjectSettingsPanel.logic";

const profile: Profile = {
  id: "work",
  name: "Work",
  color: "blue",
  projectKeys: ["device-a:repo", "device-b:repo"],
  spaces: [
    { id: "build", name: "Build", threads: [] },
    { id: "ideas", name: "Ideas", threads: [] },
  ],
};
const first = { threadKey: "device-a:thread", projectKey: "device-a:repo" };
const second = { threadKey: "device-b:thread", projectKey: "device-b:repo" };

describe("Spaces", () => {
  it("keeps same-named threads on different devices independent", () => {
    const moved = moveThreadsToSpace(
      moveThreadsToSpace(profile, [first], "build"),
      [second],
      "ideas",
    );
    expect(spaceForThread(moved, first.threadKey, first.projectKey)?.id).toBe("build");
    expect(spaceForThread(moved, second.threadKey, second.projectKey)?.id).toBe("ideas");
  });
  it("moves a selection once and returns it to the profile root", () => {
    const build = moveThreadsToSpace(profile, [first, second, first], "build");
    const ideas = moveThreadsToSpace(build, [first, second], "ideas");
    expect(ideas.spaces?.[0]?.threads).toEqual([]);
    expect(ideas.spaces?.[1]?.threads).toEqual([first, second]);
    expect(
      moveThreadsToSpace(ideas, [first, second], null).spaces?.every(
        (space) => !space.threads.length,
      ),
    ).toBe(true);
  });
  it("ignores unknown spaces and projects outside the profile", () => {
    expect(moveThreadsToSpace(profile, [first], "missing")).toBe(profile);
    expect(
      moveThreadsToSpace(profile, [{ ...first, projectKey: "other:repo" }], "build").spaces?.[0]
        ?.threads,
    ).toEqual([]);
  });
  it("deleting a space makes its threads resolve directly under the profile", () => {
    const assigned = moveThreadsToSpace(profile, [first], "build");
    const removed = {
      ...assigned,
      spaces: assigned.spaces?.filter((space) => space.id !== "build"),
    };
    expect(spaceForThread(removed, first.threadKey, first.projectKey)).toBeUndefined();
  });
  it("clears assignments when a project moves, without affecting other devices", () => {
    const assigned = moveThreadsToSpace(profile, [first, second], "build");
    const personal: Profile = { id: "personal", name: "Personal", color: "green", projectKeys: [] };
    const moved = moveProjectToProfile([assigned, personal], first.projectKey, "personal");
    expect(moved[0]?.spaces?.[0]?.threads).toEqual([second]);
    expect(moved[1]?.projectKeys).toEqual([first.projectKey]);
    expect(
      moveProjectToProfile([assigned], first.projectKey, "work")[0]?.spaces?.[0]?.threads,
    ).toEqual([first, second]);
  });
  it("reads older profiles and validates bounded space definitions", () => {
    const decode = Schema.decodeUnknownSync(Profile);
    expect(
      decode({ id: "old", name: "Old", color: "gray", projectKeys: [] }).spaces,
    ).toBeUndefined();
    expect(decode(profile)).toEqual(profile);
    expect(() => decode({ ...profile, spaces: [{ id: "x", name: " ", threads: [] }] })).toThrow();
    expect(() =>
      decode({
        ...profile,
        spaces: Array.from({ length: 65 }, (_, index) => ({
          id: String(index),
          name: "Space",
          threads: [],
        })),
      }),
    ).toThrow();
  });
});

import {
  commonSpaceProfile,
  matchesSidebarSpace,
  OUTSIDE_SPACES,
  resolveSidebarSpaceFilter,
} from "./Spaces.logic";

describe("sidebar space scope", () => {
  it("includes root chats in All threads and isolates them in Outside spaces", () => {
    const assigned = moveThreadsToSpace(profile, [first], "build");
    const refs = [first, second];
    const visible = (filter: string | null) =>
      refs.filter((ref) =>
        matchesSidebarSpace(spaceForThread(assigned, ref.threadKey, ref.projectKey)?.id, filter),
      );
    expect(visible(null)).toEqual(refs);
    expect(visible("build")).toEqual([first]);
    expect(visible(OUTSIDE_SPACES)).toEqual([second]);
    expect(visible("ideas")).toEqual([]);
  });
  it("clears removed or foreign profile space selections without selecting another space", () => {
    expect(resolveSidebarSpaceFilter(profile, "deleted")).toBe(OUTSIDE_SPACES);
    expect(resolveSidebarSpaceFilter(profile, null)).toBeNull();
    expect(resolveSidebarSpaceFilter(profile, OUTSIDE_SPACES)).toBe(OUTSIDE_SPACES);
  });
  it("finds assignment destinations from project ownership even when viewing All", () => {
    const profiles = [{ id: "all", name: "All", color: "gray" as const, projectKeys: [] }, profile];
    expect(commonSpaceProfile(profiles, [first.projectKey, second.projectKey])).toBe(profile);
    expect(commonSpaceProfile(profiles, [first.projectKey, "elsewhere:repo"])).toBeUndefined();
    expect(commonSpaceProfile(profiles, [])).toBeUndefined();
  });
});
