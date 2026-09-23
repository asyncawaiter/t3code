import { expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, type WorkItem } from "@t3tools/contracts";
import { filterTaskShelfItems, groupTasksBySpace } from "./TaskShelf.logic";

function task(id: string, profileId: string | null, spaceId: string | null) {
  return {
    environmentId: EnvironmentId.make("storage"),
    item: {
      id,
      profileId,
      spaceId,
      title: "Fix retry",
      notes: "Keep screenshots",
      brief: "",
      status: "parked",
      projectId: ProjectId.make("project"),
      source: null,
      threadId: null,
      executionEnvironmentId: EnvironmentId.make("remote"),
      links: [],
      createdAt: "2026-09-22T00:00:00Z",
      updatedAt: "2026-09-22T00:00:00Z",
    } satisfies WorkItem,
  };
}

it("keeps Space identities and each profile's Unsorted tasks separate without reordering tasks", () => {
  const tasks = [
    task("1", "a", "space"),
    task("2", "b", "space"),
    task("3", "a", null),
    task("4", "b", null),
    task("5", "a", "space"),
  ];
  const groups = groupTasksBySpace(tasks, []);
  expect(groups.map((group) => group.tasks.map(({ item }) => item.id))).toEqual([
    ["1", "5"],
    ["2"],
    ["3"],
    ["4"],
  ]);
  expect(groups[2]?.spaceName).toBe("Unsorted");
});

it("intersects Space, execution device, folder, and both search scopes", () => {
  const tasks = [task("1", "a", "space"), task("2", "b", "space"), task("3", "a", null)];
  const scope = {
    profileId: "a",
    spaceId: "space",
    environmentId: "remote",
    projectKey: "remote:project",
    search: "RETRY",
    query: "screenshots",
  };
  expect(filterTaskShelfItems(tasks, scope).map(({ item }) => item.id)).toEqual(["1"]);
  expect(filterTaskShelfItems(tasks, { ...scope, query: "unrelated" })).toEqual([]);
  expect(filterTaskShelfItems(tasks, { ...scope, environmentId: "storage" })).toEqual([]);
  expect(
    filterTaskShelfItems(tasks, { profileId: "a", spaceId: null }).map(({ item }) => item.id),
  ).toEqual(["3"]);
});
