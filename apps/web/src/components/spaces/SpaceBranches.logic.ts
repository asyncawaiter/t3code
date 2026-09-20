import type { VcsProjectGraph } from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { normalizeProjectPathForComparison as checkoutPath } from "@t3tools/shared/path";

/** Only the selected device and this repository's registered checkouts can supply chats. */
export function graphFolderChats(
  folder: EnvironmentProject,
  graph: VcsProjectGraph,
  projects: readonly EnvironmentProject[],
  chats: readonly EnvironmentThreadShell[],
) {
  const paths = new Set([
    checkoutPath(folder.workspaceRoot),
    ...graph.worktrees.map((tree) => checkoutPath(tree.path)),
  ]);
  const ids = new Set(
    projects
      .filter(
        (project) =>
          project.environmentId === folder.environmentId &&
          paths.has(checkoutPath(project.workspaceRoot)),
      )
      .map((project) => project.id),
  );
  return chats.filter(
    (chat) =>
      chat.environmentId === folder.environmentId &&
      chat.archivedAt === null &&
      (ids.has(chat.projectId) ||
        (chat.worktreePath !== null && paths.has(checkoutPath(chat.worktreePath)))),
  );
}

/** Hide inactive merged branch labels, retaining checkout tips and their complete loaded ancestry. */
export function visibleSpaceGraph(
  graph: VcsProjectGraph,
  chats: readonly EnvironmentThreadShell[],
  showMerged: boolean,
): VcsProjectGraph {
  if (showMerged) return graph;
  const active = new Set(
    chats.filter((chat) => chat.settledAt === null).map((chat) => chat.branch),
  );
  const checkedOut = new Set(graph.worktrees.map((tree) => tree.branch));
  const branches = graph.branches.filter(
    (branch) =>
      branch.merged !== true ||
      branch.current ||
      branch.name === graph.defaultBranch ||
      active.has(branch.name) ||
      checkedOut.has(branch.name),
  );
  const commits = new Map(graph.commits.map((commit) => [commit.id, commit]));
  const keep = new Set<string>();
  const queue = [
    ...branches.map((branch) => branch.head),
    ...graph.worktrees.map((tree) => tree.head),
  ];
  while (queue.length) {
    const id = queue.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    queue.push(...(commits.get(id)?.parents ?? []));
  }
  return { ...graph, branches, commits: graph.commits.filter((commit) => keep.has(commit.id)) };
}
