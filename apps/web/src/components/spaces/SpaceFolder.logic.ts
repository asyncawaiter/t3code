import type {
  EnvironmentThreadShell,
  EnvironmentProject,
} from "@t3tools/client-runtime/state/models";

export function checkoutPath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/$/, "") || "/";
}

export function folderCheckouts(
  folder: EnvironmentProject,
  spaceChats: ReadonlyArray<EnvironmentThreadShell>,
  allChats: ReadonlyArray<EnvironmentThreadShell>,
  projects: ReadonlyArray<EnvironmentProject>,
) {
  const root = checkoutPath(folder.workspaceRoot);
  const paths = new Set([root]);
  const roots = new Map(
    projects
      .filter((p) => p.environmentId === folder.environmentId)
      .map((p) => [p.id, p.workspaceRoot]),
  );
  for (const chat of spaceChats) {
    if (
      chat.environmentId === folder.environmentId &&
      checkoutPath(roots.get(chat.projectId) ?? "") === root &&
      chat.worktreePath
    )
      paths.add(checkoutPath(chat.worktreePath));
  }
  return [...paths].map((path) => ({
    path,
    isWorktree: path !== root,
    chats: allChats.filter(
      (chat) =>
        chat.environmentId === folder.environmentId &&
        chat.archivedAt === null &&
        checkoutPath(chat.worktreePath ?? roots.get(chat.projectId) ?? "") === path,
    ),
  }));
}

export function agentIsEngaged(
  chat: Pick<
    EnvironmentThreadShell,
    "session" | "hasPendingApprovals" | "hasPendingUserInput" | "backgroundLiveness"
  >,
) {
  return (
    chat.session?.status === "running" ||
    chat.hasPendingApprovals ||
    chat.hasPendingUserInput ||
    chat.backgroundLiveness === "working" ||
    chat.backgroundLiveness === "monitoring"
  );
}
