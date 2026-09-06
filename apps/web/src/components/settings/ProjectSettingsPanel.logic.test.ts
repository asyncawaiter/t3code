import type { Profile } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { moveProjectToProfile, projectGroupTitleNeedsUpdate } from "./ProjectSettingsPanel.logic";

describe("projectGroupTitleNeedsUpdate", () => {
  it("updates divergent member titles even when the next title is the derived group label", () => {
    expect(
      projectGroupTitleNeedsUpdate(["local-title", "remote-title"], "Repository name", true),
    ).toBe(true);
  });

  it("skips an untouched blur when the derived label differs from member titles", () => {
    expect(projectGroupTitleNeedsUpdate(["repo-slug", "repo-slug"], "Repository Name", false)).toBe(
      false,
    );
  });

  it("skips an update when every member already has the next title", () => {
    expect(projectGroupTitleNeedsUpdate(["Shared name", "Shared name"], "Shared name", true)).toBe(
      false,
    );
  });
});

describe("moveProjectToProfile", () => {
  const work: Profile = { id: "work", name: "Work", color: "blue", projectKeys: ["env:a"] };
  const home: Profile = { id: "home", name: "Home", color: "green", projectKeys: ["env:b"] };

  it("moves all selected checkouts across environments and removes previous memberships", () => {
    expect(moveProjectToProfile([work, home], ["env:a", "remote:a", "env:a"], "home")).toEqual([
      { ...work, projectKeys: [] },
      { ...home, projectKeys: ["env:b", "env:a", "remote:a"] },
    ]);
  });

  it("preserves assignments when a target profile no longer exists", () => {
    expect(moveProjectToProfile([work, home], "env:a", "removed")).toEqual([work, home]);
  });

  it("moves a project from one profile to another", () => {
    expect(moveProjectToProfile([work, home], "env:a", "home")).toEqual([
      { ...work, projectKeys: [] },
      { ...home, projectKeys: ["env:b", "env:a"] },
    ]);
  });

  it("unassigns the project when the target is null", () => {
    expect(moveProjectToProfile([work, home], "env:a", null)).toEqual([
      { ...work, projectKeys: [] },
      home,
    ]);
  });

  it("unassigns the project when the target is the synthesized All profile", () => {
    expect(moveProjectToProfile([work, home], "env:a", "all")).toEqual([
      { ...work, projectKeys: [] },
      home,
    ]);
  });

  it("is a no-op for a project that isn't assigned anywhere", () => {
    expect(moveProjectToProfile([work, home], "env:z", "work")).toEqual([
      { ...work, projectKeys: ["env:a", "env:z"] },
      home,
    ]);
  });
});

it("moves a scoped pin with its project and falls back to profile scope", () => {
  const source: Profile = {
    id: "source",
    name: "Source",
    color: "blue",
    projectKeys: ["env:p"],
    threadPins: [{ threadKey: "env:t", projectKey: "env:p", spaceId: "old" }],
  };
  const target: Profile = { id: "target", name: "Target", color: "gray", projectKeys: [] };
  const moved = moveProjectToProfile([source, target], "env:p", "target");
  expect(moved[0]?.threadPins).toEqual([]);
  expect(moved[1]?.threadPins).toEqual([
    { threadKey: "env:t", projectKey: "env:p", spaceId: null },
  ]);
});
