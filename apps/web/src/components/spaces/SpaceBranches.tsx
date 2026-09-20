import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderOpenIcon,
  GitBranchIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useEnvironment } from "../../state/environments";
import { useEnvironmentQuery, formatEnvironmentQueryError } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { shellEnvironment } from "../../state/shell";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkflowNavigation } from "../../hooks/useWorkflowNavigation";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import {
  BRANCH_LABEL_WIDTH,
  ROW_HEIGHT,
  graphEdgePath,
  layoutProjectGraph,
  type GraphNode,
} from "../project-graph/projectGraph";
import { graphFolderChats, visibleSpaceGraph } from "./SpaceBranches.logic";
import { SpaceCommitDiff } from "./SpaceCommitDiff";

export default function SpaceBranches({
  folder,
  projects,
  allChats,
  spaceChats,
}: {
  folder: EnvironmentProject;
  projects: readonly EnvironmentProject[];
  allChats: readonly EnvironmentThreadShell[];
  spaceChats: readonly EnvironmentThreadShell[];
}) {
  const device = useEnvironment(folder.environmentId);
  const connected = device?.connection.phase === "connected";
  const [limit, setLimit] = useState(2_000);
  const query = useEnvironmentQuery(
    connected
      ? vcsEnvironment.listRefs({
          environmentId: folder.environmentId,
          input: { cwd: folder.workspaceRoot, includeGraph: true, graphCommitLimit: limit },
        })
      : null,
  );
  useLiveRefresh(query.refresh, {
    enabled: connected,
    key: `space-graph:${folder.environmentId}:${folder.workspaceRoot}`,
  });
  const [showMerged, setShowMerged] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selection, setSelection] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);
  const graph = query.data?.graph;
  const layout = useMemo(() => {
    if (!graph) return null;
    const chats = graphFolderChats(folder, graph, projects, allChats);
    const visible = visibleSpaceGraph(graph, chats, showMerged || search.trim().length > 0);
    const hidden = new Set(
      graph.branches
        .filter((branch) => !visible.branches.includes(branch))
        .map((branch) => branch.name),
    );
    return layoutProjectGraph(
      visible,
      chats.filter((chat) => chat.worktreePath !== null || !hidden.has(chat.branch ?? "")),
      { collapse: search.trim().length === 0, expanded, compactLanes: true, showThreads: false },
    );
  }, [graph, folder, projects, allChats, showMerged, search, expanded]);
  const selected =
    layout?.nodes.find((node) => node.id === selection) ??
    layout?.unlinkedNodes.find((node) => node.id === selection);
  const needle = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      layout?.rows.filter((row) => {
        if (!needle) return false;
        return [row.commit, row.ref, ...(row.refs ?? [])].some(
          (node) =>
            node &&
            [
              node.subject,
              node.commitId,
              ...node.branches.map((branch) => branch.name),
              ...node.worktrees.map((tree) => tree.path),
              ...node.threads.map((chat) => chat.title),
            ].some((value) => value?.toLowerCase().includes(needle)),
        );
      }) ?? [],
    [layout, needle],
  );
  const [matchIndex, setMatchIndex] = useState(0);
  useEffect(() => {
    const row = matches[matchIndex % Math.max(1, matches.length)];
    if (row && scrollRef.current) scrollRef.current.scrollTop = Math.max(0, row.y - ROW_HEIGHT * 2);
  }, [matches, matchIndex]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout !== null]);
  const start = Math.max(0, scrollTop - ROW_HEIGHT * 6);
  const end = scrollTop + viewportHeight + ROW_HEIGHT * 6;
  const matchedIds = new Set(matches.map((row) => row.id));
  const commitRowIds = new Set(layout?.rows.flatMap((row) => (row.commit ? [row.commit.id] : [])));

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60"
      aria-label={`Branches in ${folder.title}`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-3 py-2">
        <label className="flex min-w-36 flex-1 items-center gap-2">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            aria-label="Search branches, commits and chats"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Find branch, commit or chat"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setMatchIndex(0);
            }}
          />
        </label>
        {needle && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span role="status">
              {matches.length
                ? `${(matchIndex % matches.length) + 1}/${matches.length}`
                : "No matches"}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous match"
              disabled={!matches.length}
              onClick={() =>
                setMatchIndex((index) => (index - 1 + matches.length) % matches.length)
              }
            >
              <ChevronUpIcon className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next match"
              disabled={!matches.length}
              onClick={() => setMatchIndex((index) => index + 1)}
            >
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showMerged}
            onChange={(event) => setShowMerged(event.target.checked)}
          />
          Show merged
        </label>
        {expanded.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
            Collapse history
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh graph"
          disabled={!connected || query.isPending}
          onClick={query.refresh}
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </div>
      {!connected ? (
        <p className="p-4 text-sm text-muted-foreground">
          {device?.label ?? "This device"} is offline. Reconnect it to read this folder's branches.
        </p>
      ) : query.error ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Could not read branches: {query.error}
        </p>
      ) : !layout ? (
        <p className="p-4 text-sm text-muted-foreground">
          {query.isPending || !query.data
            ? "Reading local Git history..."
            : query.data.isRepo
              ? "Branch graphs require Git and an updated T3 Code server on this device."
              : "This folder is not a Git repository."}
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              ref={scrollRef}
              onScroll={(event) =>
                setScrollTop(Math.floor(event.currentTarget.scrollTop / ROW_HEIGHT) * ROW_HEIGHT)
              }
              className="relative min-h-48 flex-1 overflow-auto"
              aria-label="Git branch graph"
              tabIndex={0}
              role="region"
            >
              {layout.rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No commits yet. The graph will appear after the first commit.
                </p>
              ) : (
                <div
                  className="relative min-w-full"
                  style={{ width: layout.labelX + 360, height: layout.height }}
                >
                  <svg
                    className="pointer-events-none absolute inset-0"
                    width="100%"
                    height={layout.height}
                    aria-hidden="true"
                  >
                    {layout.edges
                      .filter(
                        ({ from, to }) =>
                          Math.max(from.y, to.y) >= start && Math.min(from.y, to.y) <= end,
                      )
                      .map(({ from, to, color }) => (
                        <path
                          key={`${from.id}:${to.id}`}
                          d={graphEdgePath(from, to, false)}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.5}
                          opacity={0.7}
                        />
                      ))}
                    {layout.nodes
                      .filter(
                        (node) =>
                          node.y >= start &&
                          node.y <= end &&
                          (node.kind === "ref" || commitRowIds.has(node.id)),
                      )
                      .map((node) => (
                        <circle
                          key={node.id}
                          cx={node.x}
                          cy={node.y + ROW_HEIGHT / 2}
                          r={node.kind === "ref" ? 4 : 3}
                          fill={node.color}
                          stroke="var(--background)"
                          strokeWidth={1.5}
                        />
                      ))}
                  </svg>
                  {layout.rows
                    .filter((row) => row.y >= start && row.y <= end)
                    .map((row) => {
                      const refs = row.ref ? [row.ref] : (row.refs ?? []);
                      const first = refs[0];
                      const commit = row.commit;
                      return (
                        <div
                          key={row.id}
                          className={`absolute left-0 right-0 flex items-center border-b border-border/15 ${matchedIds.has(row.id) ? "bg-primary/8" : ""}`}
                          style={{ top: row.y, height: ROW_HEIGHT }}
                        >
                          {first && (
                            <div
                              className="absolute left-2 flex items-center gap-1"
                              style={{ width: BRANCH_LABEL_WIDTH - 12 }}
                            >
                              <Tooltip>
                                <TooltipTrigger
                                  type="button"
                                  onClick={() => setSelection(first.id)}
                                  aria-pressed={selection === first.id}
                                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring aria-pressed:bg-primary/10"
                                  style={{ borderLeft: `2px solid ${first.color}` }}
                                >
                                  {first.branches.some((branch) => branch.current) ? (
                                    <CheckIcon className="size-3 shrink-0" />
                                  ) : (
                                    <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="truncate font-medium">
                                    {first.branches[0]?.name ?? "Detached"}
                                  </span>
                                  {first.threads.length > 0 && (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                      <MessageSquareIcon className="size-3" />
                                      {first.threads.length}
                                    </span>
                                  )}
                                </TooltipTrigger>
                                <TooltipPopup>
                                  {first.branches[0]?.name ??
                                    first.worktrees[0]?.path ??
                                    first.subject}
                                </TooltipPopup>
                              </Tooltip>
                              {refs.length > 1 && (
                                <Popover>
                                  <PopoverTrigger
                                    className="rounded px-1 py-1 text-[10px] text-muted-foreground hover:bg-accent"
                                    aria-label={`${refs.length - 1} more branches at this commit`}
                                  >
                                    +{refs.length - 1}
                                  </PopoverTrigger>
                                  <PopoverPopup
                                    align="start"
                                    className="max-w-80"
                                    viewportClassName="p-1"
                                  >
                                    {refs.slice(1).map((ref) => (
                                      <button
                                        key={ref.id}
                                        type="button"
                                        className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                                        onClick={() => setSelection(ref.id)}
                                      >
                                        {ref.branches[0]?.name ??
                                          ref.worktrees[0]?.path ??
                                          "Detached"}
                                        {ref.threads.length ? ` · ${ref.threads.length} chats` : ""}
                                      </button>
                                    ))}
                                  </PopoverPopup>
                                </Popover>
                              )}
                            </div>
                          )}
                          <div className="absolute right-2 min-w-0" style={{ left: layout.labelX }}>
                            {row.collapsed ? (
                              <button
                                type="button"
                                aria-expanded={row.expanded}
                                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                                onClick={() =>
                                  setExpanded((current) => {
                                    const next = new Set(current);
                                    if (next.has(row.id)) next.delete(row.id);
                                    else next.add(row.id);
                                    return next;
                                  })
                                }
                              >
                                {row.expanded ? (
                                  <ChevronUpIcon className="size-3" />
                                ) : (
                                  <ChevronDownIcon className="size-3" />
                                )}
                                {row.collapsed.length} commits
                              </button>
                            ) : commit ? (
                              <Tooltip>
                                <TooltipTrigger
                                  type="button"
                                  onClick={() => setSelection(commit.id)}
                                  aria-pressed={selection === commit.id}
                                  className="flex w-full items-center gap-3 rounded px-1 py-1 text-left text-xs hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring aria-pressed:bg-primary/10"
                                >
                                  <span className="truncate">{commit.subject}</span>
                                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                                    {commit.id.slice(0, 7)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipPopup>
                                  {commit.subject}
                                  {commit.author ? ` · ${commit.author.name}` : ""}
                                </TooltipPopup>
                              </Tooltip>
                            ) : (
                              <span className="px-1 text-xs text-muted-foreground">
                                {row.ref?.worktrees.some((tree) => tree.dirty)
                                  ? "Uncommitted changes"
                                  : (row.ref?.subject ?? "Checkout")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            {selected && (
              <BranchDetails
                key={selected.id}
                node={selected}
                folder={folder}
                spaceChats={spaceChats}
                connected={connected}
                onClose={() => setSelection(null)}
                onSelect={setSelection}
              />
            )}
          </div>
          {(graph?.truncated || layout.unlinkedNodes.length > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
              {layout.unlinkedNodes.length > 0 && (
                <Popover>
                  <PopoverTrigger className="hover:text-foreground">
                    {layout.unlinkedNodes.reduce((sum, node) => sum + node.threads.length, 0)} chats
                    without a current branch
                  </PopoverTrigger>
                  <PopoverPopup align="start" className="max-w-80" viewportClassName="p-1">
                    {layout.unlinkedNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelection(node.id)}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                      >
                        {node.subject}
                      </button>
                    ))}
                  </PopoverPopup>
                </Popover>
              )}
              {graph?.truncated && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={query.isPending || limit >= 20_000}
                  onClick={() => setLimit((current) => Math.min(20_000, current + 2_000))}
                >
                  {limit >= 20_000 ? "History limited to 20,000 commits" : "Load older commits"}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BranchDetails({
  node,
  folder,
  spaceChats,
  connected,
  onClose,
  onSelect,
}: {
  node: GraphNode;
  folder: EnvironmentProject;
  spaceChats: readonly EnvironmentThreadShell[];
  connected: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const navigate = useWorkflowNavigation();
  const device = useEnvironment(folder.environmentId);
  const openFolder = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const [error, setError] = useState<string | null>(null);
  const spaceKeys = new Set(
    spaceChats.map((chat) => scopedThreadKey(scopeThreadRef(chat.environmentId, chat.id))),
  );
  return (
    <aside
      className={`flex max-h-[45vh] min-h-0 flex-col border-t border-border/60 bg-card/30 lg:max-h-none lg:shrink-0 lg:border-t-0 lg:border-l ${node.kind === "commit" ? "lg:w-1/2" : "lg:w-80"}`}
      aria-label={node.kind === "commit" ? "Commit details" : "Branch details"}
    >
      <header className="flex items-start gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-medium">
            {node.branches[0]?.name ?? node.subject}
          </h3>
          {node.commitId && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {node.commitId.slice(0, 12)}
            </p>
          )}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close details" onClick={onClose}>
          <XIcon className="size-3.5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-xs">
        {node.kind === "commit" ? (
          <>
            {node.author && (
              <p className="text-muted-foreground">
                {node.author.name} &lt;{node.author.email}&gt;
                {node.committedAtEpochSeconds !== undefined
                  ? ` · ${new Date(node.committedAtEpochSeconds * 1000).toLocaleString()}`
                  : ""}
              </p>
            )}
            {node.parents.length > 1 && (
              <p className="text-muted-foreground">
                Merge commit. Changes compared with its first parent.
              </p>
            )}
            {node.commitId && (
              <SpaceCommitDiff
                environmentId={folder.environmentId}
                cwd={folder.workspaceRoot}
                commit={node.commitId}
              />
            )}
          </>
        ) : (
          <>
            {node.worktrees.map((tree) => (
              <div key={tree.path} className="space-y-1">
                <p className="break-all font-mono text-[11px] text-muted-foreground">{tree.path}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {tree.dirty === true
                      ? "Uncommitted changes"
                      : tree.dirty === false
                        ? "Clean checkout"
                        : "Checkout status unavailable"}
                    {tree.locked ? " · Locked" : ""}
                  </span>
                  {device?.serverConfig?.availableEditors.includes("file-manager") && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Open ${tree.path} on ${device.label}`}
                      disabled={!connected || tree.prunable}
                      onClick={async () => {
                        const result = await openFolder({
                          environmentId: folder.environmentId,
                          input: { cwd: tree.path, editor: "file-manager" },
                        });
                        setError(
                          result._tag === "Failure"
                            ? formatEnvironmentQueryError(result.cause)
                            : null,
                        );
                      }}
                    >
                      <FolderOpenIcon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            {node.commitId && (
              <Button size="sm" variant="outline" onClick={() => onSelect(node.commitId!)}>
                Inspect latest commit
              </Button>
            )}
            {node.threads.length ? (
              <div className="space-y-1">
                <h4 className="pb-1 font-medium">Related chats</h4>
                {node.threads.map((chat) => {
                  const key = scopedThreadKey(scopeThreadRef(chat.environmentId, chat.id));
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => navigate(key)}
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="block truncate">{chat.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {spaceKeys.has(key) ? "This space" : "Outside this space"} ·{" "}
                        {chat.settledAt
                          ? "Settled"
                          : chat.session?.status === "running"
                            ? "Running"
                            : "Active"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground">No chats associated with this branch.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
