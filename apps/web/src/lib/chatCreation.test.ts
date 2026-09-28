import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, type Profile } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { draftMatchesChatLocation, seedPlacement, seedWorkspace } from "./chatCreation";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const projectId = ProjectId.make("repo");
const draft = { environmentId: local, projectId, threadId: ThreadId.make("draft") };
const project = scopeProjectRef(local, projectId);
const profile: Profile = {
  id: "work",
  name: "Work",
  color: "blue",
  projectKeys: ["local:repo", "remote:repo"],
  spaces: [
    {
      id: "client",
      name: "Client",
      threads: [{ threadKey: "local:draft", projectKey: "local:repo" }],
    },
  ],
};

describe("new chat draft reuse", () => {
  it("requires the physical checkout and space placement to match", () => {
    expect(draftMatchesChatLocation(draft, project, "client", [profile])).toBe(true);
    expect(draftMatchesChatLocation(draft, project, null, [profile])).toBe(false);
    expect(draftMatchesChatLocation(draft, project, "another", [profile])).toBe(false);
    expect(
      draftMatchesChatLocation(draft, scopeProjectRef(remote, projectId), "client", [profile]),
    ).toBe(false);
    expect(
      draftMatchesChatLocation({ ...draft, threadId: ThreadId.make("outside") }, project, null, [
        profile,
      ]),
    ).toBe(true);
    expect(draftMatchesChatLocation(draft, project, null, [{ ...profile, projectKeys: [] }])).toBe(
      true,
    );
  });
});

describe("new chat seeded from a chat", () => {
  it("lands in the seed chat's profile and space", () => {
    expect(seedPlacement([profile], draft)).toEqual({ profileId: "work", spaceId: "client" });
    expect(seedPlacement([profile], { ...draft, threadId: ThreadId.make("loose") })).toEqual({
      profileId: "work",
      spaceId: undefined,
    });
    expect(seedPlacement([profile], { ...draft, projectId: ProjectId.make("elsewhere") })).toEqual({
      profileId: undefined,
      spaceId: undefined,
    });
  });

  it("gives a worktree chat a fresh worktree and keeps a main checkout chat local", () => {
    const sent = { ...draft, worktreePath: "/tmp/wt" };
    expect(seedWorkspace(sent, true)).toEqual({
      envMode: "worktree",
      branch: null,
      worktreePath: null,
    });
    expect(seedWorkspace({ ...sent, worktreePath: null }, true).envMode).toBe("local");
  });

  it("passes an unsent draft's branch only within the same project", () => {
    const pending = {
      ...draft,
      worktreePath: null,
      draft: { envMode: "worktree" as const, branch: "main", startFromOrigin: true },
    };
    expect(seedWorkspace(pending, true)).toEqual({
      envMode: "worktree",
      branch: "main",
      worktreePath: null,
      startFromOrigin: true,
    });
    expect(seedWorkspace(pending, false)).not.toHaveProperty("branch");
  });
});
