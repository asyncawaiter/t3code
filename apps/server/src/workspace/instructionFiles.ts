// @effect-diagnostics nodeBuiltinImport:off - Dirents detect directory symlinks without a stat call per entry.
// @effect-diagnostics globalDate:off - Wall-clock budget for bounded native filesystem discovery.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { ProjectInstructionsResult } from "@t3tools/contracts";

const NAMES = new Set([
  "AGENTS.md",
  "AGENTS.override.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
]);
const EXCLUDED = new Set([
  ".git",
  "node_modules",
  ".t3",
  ".venv",
  "venv",
  "vendor",
  "dist",
  "build",
  ".next",
]);

function isInstruction(path: string) {
  return (
    NAMES.has(NodePath.basename(path)) ||
    /(?:^|[/\\])\.(?:cursor|claude)[/\\]rules[/\\].*\.(?:md|mdc)$/.test(path)
  );
}

/** Discover instruction sources without interpreting provider precedence or following directories through symlinks. */
export async function discoverInstructionFiles(cwd: string): Promise<ProjectInstructionsResult> {
  const root = await NodeFSP.realpath(cwd);
  const files: Array<ProjectInstructionsResult["files"][number]> = [];
  const warnings: string[] = [];
  let truncated = false;
  const deadline = Date.now() + 5_000;
  const add = (path: string, scope: "parent" | "root" | "subfolder") => files.push({ path, scope });
  let parent = NodePath.dirname(root);
  while (parent !== root) {
    for (const name of NAMES) {
      const path = NodePath.join(parent, name);
      try {
        if ((await NodeFSP.stat(path)).isFile()) add(path, "parent");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          warnings.push(`Could not inspect ${path}`);
      }
    }
    const next = NodePath.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  const pending = [root];
  let visited = 0;
  // Bounded discovery keeps a monorepo from turning a space landing into an unbounded filesystem scan.
  while (pending.length) {
    if (++visited > 2_000 || files.length >= 200 || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const dir = pending.shift()!;
    try {
      const entries = await NodeFSP.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = NodePath.join(dir, entry.name);
        if (entry.isDirectory() && !EXCLUDED.has(entry.name)) pending.push(path);
        else if ((entry.isFile() || entry.isSymbolicLink()) && isInstruction(path)) {
          add(path, dir === root ? "root" : "subfolder");
          if (files.length >= 200) {
            truncated = true;
            break;
          }
        }
      }
    } catch {
      warnings.push(`Could not read ${dir}`);
    }
  }
  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    truncated,
    warnings,
    excludedDirectories: [...EXCLUDED],
  };
}
