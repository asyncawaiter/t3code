import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, type Profile } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { draftMatchesChatLocation } from "./chatCreation";

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
