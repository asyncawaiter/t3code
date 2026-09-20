import { editorLabelForPlatform } from "../../editorLabels";
import { shellEnvironment } from "../../state/shell";
import { formatEnvironmentQueryError } from "../../state/query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  FileTextIcon,
  FolderOpenIcon,
  GitBranchIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";
import type { EnvironmentId, ThreadLinkedPullRequest } from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { useEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { projectEnvironment } from "../../state/projects";
import { vcsEnvironment } from "../../state/vcs";
import { reviewEnvironment } from "../../state/review";
import { pullRequestEnvironment } from "../../state/pullRequests";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkflowNavigation } from "../../hooks/useWorkflowNavigation";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { ProjectFavicon } from "../ProjectFavicon";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { PullRequestChecksPopover } from "../pullRequest/PullRequestChecksPopover";
import { pullRequestChecksState } from "../pullRequest/pullRequestPresentation";
import { agentIsEngaged, folderCheckouts } from "./SpaceFolder.logic";

export function SpaceFolder({
  folder,
  spaceChats,
  allChats,
  projects,
  initiallyOpen = false,
  onOpenBranches,
}: {
  initiallyOpen?: boolean;
  onOpenBranches?: () => void;
  folder: EnvironmentProject;
  spaceChats: ReadonlyArray<EnvironmentThreadShell>;
  allChats: ReadonlyArray<EnvironmentThreadShell>;
  projects: ReadonlyArray<EnvironmentProject>;
}) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initiallyOpen);
  const device = useEnvironment(folder.environmentId);
  const connected = device?.connection.phase === "connected";
  const instructions = useEnvironmentQuery(
    connected && expanded
      ? projectEnvironment.instructions({
          environmentId: folder.environmentId,
          input: { cwd: folder.workspaceRoot },
        })
      : null,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const files = instructions.data?.files ?? [];
  const selected =
    files.find((file) => file.path === selectedPath) ??
    files.find((file) => file.scope === "root" && /[/\\]AGENTS.md$/.test(file.path)) ??
    files.find((file) => file.scope === "root") ??
    files[0];
  const checkouts = folderCheckouts(folder, spaceChats, allChats, projects);

  return (
    <section
      className="overflow-hidden rounded-xl border border-border/70 bg-card/20"
      aria-label={`Folder ${folder.title}`}
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-border/60 px-4 py-3">
        <ProjectFavicon project={folder} className="mt-0.5 size-6" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{folder.title}</h2>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {folder.workspaceRoot}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {device?.label ?? "Device unavailable"} ·{" "}
            {connected ? "Connected" : "Offline, live folder data unavailable"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onOpenBranches && (
            <Button size="sm" variant="ghost" onClick={onOpenBranches}>
              <GitBranchIcon className="size-3.5" />
              Branches
            </Button>
          )}
          {device?.serverConfig?.availableEditors.includes("file-manager") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!connected || opening}
              title={`Open on ${device.label}`}
              onClick={async () => {
                setOpening(true);
                setOpenError(null);
                try {
                  const result = await openInEditor({
                    environmentId: folder.environmentId,
                    input: { cwd: folder.workspaceRoot, editor: "file-manager" },
                  });
                  if (result._tag === "Failure")
                    setOpenError(formatEnvironmentQueryError(result.cause));
                } finally {
                  setOpening(false);
                }
              }}
            >
              <FolderOpenIcon className="size-3.5" />
              Open in{" "}
              {editorLabelForPlatform("file-manager", device.serverConfig.environment.platform.os)}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Inspect folder"}
          </Button>
        </div>
      </header>
      {openError && (
        <p role="alert" className="px-5 py-2 text-xs text-destructive">
          {openError}
        </p>
      )}
      {expanded &&
        (connected ? (
          <>
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <FileTextIcon className="size-4" />
                  Instructions
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={instructions.isPending}
                  onClick={instructions.refresh}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Scan
                </Button>
              </div>
              {instructions.error && (
                <p role="alert" className="text-xs text-destructive">
                  Instruction discovery unavailable: {instructions.error}
                </p>
              )}
              {!instructions.data && !instructions.error && (
                <p className="text-xs text-muted-foreground">Looking for instruction files…</p>
              )}
              {instructions.data && (
                <>
                  {files.length ? (
                    <>
                      <label className="block text-xs text-muted-foreground">
                        Instruction source
                        <select
                          aria-label={`Instruction source in ${folder.title}`}
                          value={selected?.path}
                          onChange={(event) => setSelectedPath(event.target.value)}
                          className="mt-1 block w-full rounded-md border border-input bg-background p-2 text-xs text-foreground"
                        >
                          {files.map((file) => (
                            <option key={file.path} value={file.path}>
                              {file.scope === "parent"
                                ? "Parent"
                                : file.scope === "root"
                                  ? "Folder root"
                                  : "Subfolder"}{" "}
                              · {file.path}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selected && (
                        <InstructionFile
                          key={selected.path}
                          environmentId={folder.environmentId}
                          cwd={folder.workspaceRoot}
                          path={selected.path}
                          scope={selected.scope}
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No AGENTS.md or other supported instruction files found.
                    </p>
                  )}
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Scan coverage
                      {instructions.data.truncated || instructions.data.warnings.length
                        ? " (incomplete)"
                        : ""}
                    </summary>
                    <p className="mt-2">
                      AGENTS.md, AGENTS.override.md, CLAUDE.md, GEMINI.md, .cursorrules, and
                      .cursor/rules or .claude/rules Markdown files. Directory symlinks are not
                      followed. Excluded directories:{" "}
                      {instructions.data.excludedDirectories.length
                        ? instructions.data.excludedDirectories.join(", ")
                        : "Device file-index exclusions"}
                      .
                    </p>
                    {instructions.data.truncated && (
                      <p>Scan limit reached. More files may exist.</p>
                    )}
                    {instructions.data.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </details>
                </>
              )}
            </div>
            <div className="space-y-4 p-5">
              <h3 className="text-sm font-medium">Checkouts and unfinished work</h3>
              {checkouts.map((checkout) => (
                <Checkout key={checkout.path} environmentId={folder.environmentId} {...checkout} />
              ))}
            </div>
          </>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Reconnect this device to read its instructions, agent activity, and Git state.
          </p>
        ))}
    </section>
  );
}

function InstructionFile({
  environmentId,
  cwd,
  path,
  scope,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  path: string;
  scope: string;
}) {
  const file = useEnvironmentQuery(
    projectEnvironment.readFile({ environmentId, input: { cwd, relativePath: path } }),
  );
  const [source, setSource] = useState(false);
  const imageBaseDir =
    path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))) || cwd;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {scope === "parent"
            ? "Parent source. Whether it applies depends on the provider."
            : scope === "subfolder"
              ? "Scoped source for this subfolder. It may not apply elsewhere."
              : "Folder-level source. Provider precedence may override it."}
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSource(!source)}>
            {source ? "Rendered" : "Source"}
          </Button>
          <Button size="sm" variant="ghost" onClick={file.refresh} disabled={file.isPending}>
            Refresh
          </Button>
        </div>
      </div>
      {file.error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not read this file: {file.error}
        </p>
      ) : file.data ? (
        <>
          {file.data.truncated && (
            <p className="text-xs text-amber-600">
              File exceeds the reader limit. Only part is shown.
            </p>
          )}
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border/50 bg-background p-4">
            {source ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                {file.data.contents}
              </pre>
            ) : (
              <ChatMarkdown
                text={file.data.contents}
                cwd={cwd}
                imageBaseDir={imageBaseDir}
                environmentId={environmentId}
              />
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Reading file…</p>
      )}
      <p className="text-xs text-muted-foreground">
        Read-only. Viewing a file does not add it to chat context.
      </p>
    </div>
  );
}

function Checkout({
  environmentId,
  path,
  isWorktree,
  chats,
}: {
  environmentId: EnvironmentId;
  path: string;
  isWorktree: boolean;
  chats: ReadonlyArray<EnvironmentThreadShell>;
}) {
  const openChat = useWorkflowNavigation();
  const status = useEnvironmentQuery(
    vcsEnvironment.status({ environmentId, input: { cwd: path } }),
  );
  const refresh = useAtomCommand(vcsEnvironment.refreshStatus, { reportFailure: false });
  const reread = () => {
    void refresh({ environmentId, input: { cwd: path } });
  };
  useLiveRefresh(reread, { key: `space-git:${environmentId}:${path}` });
  const engaged = chats.filter(agentIsEngaged);
  const git = status.data;
  const [inspect, setInspect] = useState<"working-tree" | "branch-range" | null>(null);
  const linked = [
    ...new Map(
      chats.flatMap((chat) =>
        chat.linkedPullRequest
          ? [
              [
                `${chat.linkedPullRequest.repository}:${chat.linkedPullRequest.number}`,
                chat.linkedPullRequest,
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <GitBranchIcon className="size-4" />
            {isWorktree ? "Worktree" : "Folder checkout"}
            {git?.refName && (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {git.refName}
              </span>
            )}
          </p>
          {isWorktree && (
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{path}</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={reread}>
          Refresh Git
        </Button>
      </div>
      {engaged.length > 1 && (
        <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <UsersIcon className="size-4" />
          {engaged.length} agents share this checkout. File edits may overlap.
        </p>
      )}
      {engaged.length ? (
        <ul className="space-y-1">
          {engaged.map((chat) => (
            <li key={chat.id}>
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: chat.id }}
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    openChat(`${environmentId}:${chat.id}`);
                  }
                }}
                className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className="truncate">{chat.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {chat.hasPendingApprovals
                    ? "Approval"
                    : chat.hasPendingUserInput
                      ? "Waiting for input"
                      : chat.backgroundLiveness === "monitoring"
                        ? "Monitoring"
                        : "Running"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No agents currently working in this checkout.
        </p>
      )}
      {status.error ? (
        <p className="text-xs text-destructive">Git unavailable: {status.error}</p>
      ) : !git ? (
        <p className="text-xs text-muted-foreground">Reading Git state…</p>
      ) : !git.isRepo ? (
        <p className="text-xs text-muted-foreground">This folder is not a Git repository.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInspect(inspect === "working-tree" ? null : "working-tree")}
            >
              {git.workingTree.files.length} changed{" "}
              {git.workingTree.files.length === 1 ? "file" : "files"}
            </Button>
            {git.hasUpstream ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspect(inspect === "branch-range" ? null : "branch-range")}
                >
                  {git.aheadCount} unpushed {git.aheadCount === 1 ? "commit" : "commits"}
                </Button>
                <span className="text-muted-foreground">{git.behindCount} behind upstream</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                No upstream configured; unpushed count unavailable.
              </span>
            )}
          </div>
          {inspect && <CheckoutDiff environmentId={environmentId} cwd={path} kind={inspect} />}
          {git.pr && (
            <a
              href={git.pr.url}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-primary hover:underline"
            >
              #{git.pr.number} {git.pr.title} · {git.pr.state}
            </a>
          )}
          {linked.map((reference) => (
            <LinkedChecks
              key={`${reference.repository}:${reference.number}`}
              environmentId={environmentId}
              reference={reference}
            />
          ))}
        </>
      )}
    </div>
  );
}

function CheckoutDiff({
  environmentId,
  cwd,
  kind,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  kind: "working-tree" | "branch-range";
}) {
  const query = useEnvironmentQuery(
    reviewEnvironment.diffPreview({
      environmentId,
      input: { cwd, ...(kind === "branch-range" ? { baseRef: "@{upstream}" } : {}) },
    }),
  );
  const diff = query.data?.sources.find((source) => source.kind === kind);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" disabled={query.isPending} onClick={query.refresh}>
        Refresh diff
      </Button>
      {query.error ? (
        <p className="text-xs text-destructive">{query.error}</p>
      ) : !query.data ? (
        <p className="text-xs text-muted-foreground">Loading changes…</p>
      ) : (
        <>
          {diff?.truncated && (
            <p className="text-xs text-amber-600">Diff truncated by the server.</p>
          )}
          <pre className="max-h-96 overflow-auto rounded bg-background p-3 font-mono text-xs">
            {diff?.diff || "No changes in this comparison."}
          </pre>
        </>
      )}
    </div>
  );
}

function LinkedChecks({
  environmentId,
  reference,
}: {
  environmentId: EnvironmentId;
  reference: ThreadLinkedPullRequest;
}) {
  const query = useEnvironmentQuery(
    pullRequestEnvironment.detail({
      environmentId,
      input: {
        projectId: reference.projectId,
        repository: reference.repository,
        number: reference.number,
      },
    }),
  );
  useLiveRefresh(query.refresh, {
    key: `space-checks:${environmentId}:${reference.repository}:${reference.number}`,
  });
  const checksState = query.data ? pullRequestChecksState(query.data.checks) : null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>#{reference.number} checks</span>
      {query.data && checksState ? (
        <PullRequestChecksPopover
          checksState={checksState}
          checks={query.data.checks}
          environmentId={environmentId}
          reference={reference}
        />
      ) : (
        <span className="text-muted-foreground">
          {query.error ? "Unavailable" : query.data ? "Not reported" : "Loading…"}
        </span>
      )}
    </div>
  );
}
