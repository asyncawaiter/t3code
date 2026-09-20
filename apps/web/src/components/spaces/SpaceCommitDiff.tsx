import { useMemo } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentQuery } from "../../state/query";
import { reviewEnvironment } from "../../state/review";
import { useTheme } from "../../hooks/useTheme";
import { getRenderablePatch, resolveDiffThemeName } from "../../lib/diffRendering";
import { StyledDiffCodeView } from "../diffs/StyledDiffCodeView";

export function SpaceCommitDiff({
  environmentId,
  cwd,
  commit,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  commit: string;
}) {
  const query = useEnvironmentQuery(
    reviewEnvironment.diffPreview({ environmentId, input: { cwd, commit } }),
  );
  // Older hosts ignore unknown input fields. Never mislabel their working-tree diff as this commit.
  const source = query.data?.sources.find((entry) => entry.id === `commit:${commit}`);
  const patch = useMemo(
    () => getRenderablePatch(source?.diff, `space-commit:${environmentId}:${cwd}:${commit}`),
    [source?.diff, environmentId, cwd, commit],
  );
  const items = useMemo(
    () =>
      patch?.kind === "files"
        ? patch.files.map((file, index) => ({
            type: "diff" as const,
            id: `${commit}:${index}`,
            fileDiff: file,
          }))
        : [],
    [patch, commit],
  );
  const { resolvedTheme } = useTheme();
  if (query.error)
    return (
      <p role="alert" className="text-destructive">
        Could not read commit: {query.error}
      </p>
    );
  if (!query.data) return <p className="text-muted-foreground">Loading changes...</p>;
  if (!source)
    return (
      <p className="text-muted-foreground">
        Update T3 Code on this folder's device to inspect commits.
      </p>
    );
  return (
    <>
      {source.truncated && (
        <p className="text-muted-foreground">Large diff. The server returned a partial preview.</p>
      )}
      {patch?.kind === "files" ? (
        <StyledDiffCodeView
          className="h-[55vh] min-h-48 overflow-auto"
          items={items}
          options={{ diffStyle: "unified", theme: resolveDiffThemeName(resolvedTheme) }}
        />
      ) : patch?.kind === "raw" ? (
        <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
          {patch.text}
        </pre>
      ) : (
        <p className="text-muted-foreground">This commit has no file changes.</p>
      )}
    </>
  );
}
