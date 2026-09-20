import { expect, it } from "vite-plus/test";
import type { Profile } from "@t3tools/contracts";
import { taskFolders } from "./profileSync.ts";

const projects = [
  { environmentId: "poly", id: "pod" },
  { environmentId: "poly", id: "deployments" },
  { environmentId: "poly", id: "default" },
  { environmentId: "godel", id: "deployments" },
];
const profile: Profile = {
  id: "work",
  name: "Work",
  color: "blue",
  projectKeys: projects.map((project) => `${project.environmentId}:${project.id}`),
  spaces: [
    {
      id: "deployments",
      name: "Deployments",
      threads: [
        { threadKey: "poly:chat", projectKey: "poly:deployments" },
        { threadKey: "godel:chat", projectKey: "godel:deployments" },
      ],
      newChatDefaultsByDevice: {
        poly: { projectKey: "poly:default", workspaceRoot: "/default", deviceLabel: "Poly" },
      },
    },
  ],
};

it("offers only the selected space's folders on the selected device, including unused defaults", () => {
  expect(taskFolders(projects, "poly", profile, "deployments")).toEqual(projects.slice(1, 3));
  expect(taskFolders(projects, "godel", profile, "deployments")).toEqual([projects[3]]);
  expect(taskFolders(projects, "poly", profile, "missing")).toEqual([]);
  expect(taskFolders(projects, "poly", undefined, "deployments")).toEqual([]);
});

it("keeps unscoped captures available and limits profile captures to their folders", () => {
  expect(taskFolders(projects, "poly", undefined, null)).toEqual(projects.slice(0, 3));
  expect(taskFolders(projects, "poly", { ...profile, projectKeys: ["poly:pod"] }, null)).toEqual([
    projects[0],
  ]);
  expect(taskFolders(projects, null, profile, "deployments")).toEqual([]);
});
