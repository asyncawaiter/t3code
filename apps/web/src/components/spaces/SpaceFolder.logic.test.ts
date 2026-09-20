import { expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { graphFolderChats, visibleSpaceGraph } from "./SpaceBranches.logic";
import type { VcsProjectGraph } from "@t3tools/contracts";
import { agentIsEngaged, folderCheckouts } from "./SpaceFolder.logic";

const folder: EnvironmentProject = {
  environmentId: EnvironmentId.make("a"),
  id: ProjectId.make("repo"),
  title: "Folder",
  workspaceRoot: "/repo",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
function chat(id: string, override: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId: folder.environmentId,
    projectId: folder.id,
    id: ThreadId.make(id),
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...override,
  };
}
it("keeps device and worktree isolation while detecting another space's agent on the same checkout", () => {
  const local = chat("local", { hasPendingApprovals: true });
  const isolated = chat("isolated", { worktreePath: "/worktree/", backgroundLiveness: "working" });
  const otherSpace = chat("other-space", { hasPendingUserInput: true });
  const remote = chat("remote", { environmentId: EnvironmentId.make("b") });
  const archived = chat("archived", { archivedAt: folder.createdAt });
  const groups = folderCheckouts(
    folder,
    [local, isolated],
    [local, isolated, otherSpace, remote, archived],
    [folder],
  );
  expect(
    groups.map((group) => [group.path, group.isWorktree, group.chats.map((item) => item.id)]),
  ).toEqual([
    ["/repo", false, ["local", "other-space"]],
    ["/worktree", true, ["isolated"]],
  ]);
  expect(groups[0]?.chats.filter(agentIsEngaged)).toHaveLength(2);
  expect(agentIsEngaged(chat("idle"))).toBe(false);
});

it("scopes graph chats to the repository and device, then hides only inactive merged refs", () => {
  const graph: VcsProjectGraph = {
    defaultBranch: "main",
    truncated: false,
    branches: [
      { name: "main", head: "b", current: true, merged: true },
      { name: "old", head: "a", current: false, merged: true },
      { name: "busy", head: "a", current: false, merged: true },
      { name: "checkout", head: "a", current: false, merged: true },
    ],
    commits: [
      { id: "b", parents: ["a"], subject: "New" },
      { id: "a", parents: [], subject: "Initial" },
    ],
    worktrees: [
      {
        path: "/other-checkout",
        branch: "checkout",
        head: "a",
        isMain: false,
        locked: false,
        prunable: false,
      },
    ],
  };
  const chats = [
    chat("this-space", { branch: "busy" }),
    chat("another-space", { worktreePath: "/other-checkout" }),
    chat("same-path-other-host", {
      environmentId: EnvironmentId.make("remote"),
      worktreePath: "/other-checkout",
    }),
    chat("unrelated-folder", { projectId: ProjectId.make("elsewhere"), branch: "busy" }),
  ];
  const scoped = graphFolderChats(folder, graph, [folder], chats);
  expect(scoped.map((item) => item.id)).toEqual(["this-space", "another-space"]);
  const visible = visibleSpaceGraph(graph, scoped, false);
  expect(visible.branches.map((branch) => branch.name)).toEqual(["main", "busy", "checkout"]);
  expect(visible.commits).toEqual(graph.commits);
  expect(visibleSpaceGraph(graph, scoped, true)).toBe(graph);
});
