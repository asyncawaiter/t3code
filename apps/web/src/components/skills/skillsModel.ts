import type {
  EnvironmentId,
  ProviderInstanceId,
  SkillInstall,
  SkillInventory,
  SkillSource,
} from "@t3tools/contracts";

import { scoreChatPickerMatch } from "../spaces/chatPickerSearch";

/** One environment's skill data as known to the page: never loaded, live, or last-known-while-offline. */
export interface SkillEnvironmentInput {
  environmentId: EnvironmentId;
  label: string;
  online: boolean;
  /** Null when this environment has never returned an inventory (live or cached). */
  inventory: SkillInventory | null;
  /** True when `inventory` came from the offline cache rather than a live fetch. */
  stale: boolean;
}

/** One provider instance on one device: a place a skill can be installed. */
export interface SkillTarget {
  key: string;
  environmentId: EnvironmentId;
  envLabel: string;
  online: boolean;
  instanceId: ProviderInstanceId;
  providerLabel: string;
  driver: string;
  writable: boolean;
  enabled: boolean;
  /** The instance's personal skills directory, or null when `writable` is false. */
  skillsDirectory: string | null;
}

export type SkillCellStatus =
  | "in-sync"
  | "drift"
  | "missing"
  | "unsupported"
  | "offline"
  | "readonly";

export interface SkillCell {
  status: SkillCellStatus;
  install: SkillInstall | null;
}

export interface SkillVariantInstall {
  target: SkillTarget;
  install: SkillInstall;
}

export interface SkillVariant {
  /** Null groups every install whose folder hash couldn't be read; each is its own variant. */
  hash: string | null;
  installs: SkillVariantInstall[];
  modifiedAt: string | null;
}

export type SkillStatus = "in-sync" | "drift" | "gaps" | "readonly";

const SOURCE_RANK: Record<SkillSource, number> = {
  personal: 0,
  shared: 1,
  builtin: 2,
  project: 3,
};

export interface SkillGroup {
  name: string;
  description: string | undefined;
  source: SkillSource;
  variants: SkillVariant[];
  primaryVariant: SkillVariant;
  cells: Map<string, SkillCell>;
  coverage: { installed: number; expected: number };
  status: SkillStatus;
}

function targetKey(environmentId: string, instanceId: string): string {
  return `${environmentId}:${instanceId}`;
}

function directoryKey(environmentId: string, skillsDirectory: string): string {
  return `${environmentId}::${skillsDirectory}`;
}

/**
 * Collapses install targets that share one (environment, skills directory) write
 * destination into a single entry, keeping the first one seen. Two provider instances
 * pointed at the same folder (e.g. two Claude-shaped drivers sharing `~/.claude/skills`)
 * are one install slot on disk, not two: bulk actions must write to it once.
 */
export function dedupeWriteTargets(targets: readonly SkillTarget[]): SkillTarget[] {
  const seen = new Set<string>();
  const result: SkillTarget[] = [];
  for (const target of targets) {
    const key = target.skillsDirectory
      ? directoryKey(target.environmentId, target.skillsDirectory)
      : target.key;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}

/** Every writable-or-not install slot across every online-or-cached environment. */
export function buildSkillTargets(environments: readonly SkillEnvironmentInput[]): SkillTarget[] {
  const targets: SkillTarget[] = [];
  for (const env of environments) {
    if (!env.inventory) continue;
    for (const provider of env.inventory.providers) {
      targets.push({
        key: targetKey(env.environmentId, provider.instanceId),
        environmentId: env.environmentId,
        envLabel: env.label,
        online: env.online,
        instanceId: provider.instanceId,
        providerLabel: provider.displayName ?? provider.driver,
        driver: provider.driver,
        writable: provider.skillsDirectory !== null,
        enabled: provider.enabled,
        skillsDirectory: provider.skillsDirectory,
      });
    }
  }
  return targets;
}

function newestModifiedAt(installs: readonly SkillVariantInstall[]): string | null {
  let best: string | null = null;
  for (const { install } of installs) {
    if (install.modifiedAt && (!best || install.modifiedAt > best)) best = install.modifiedAt;
  }
  return best;
}

function pickPrimaryVariant(variants: readonly SkillVariant[]): SkillVariant {
  let best = variants[0]!;
  for (const variant of variants.slice(1)) {
    if (variant.installs.length > best.installs.length) {
      best = variant;
    } else if (variant.installs.length === best.installs.length) {
      const variantNewest = variant.modifiedAt ?? "";
      const bestNewest = best.modifiedAt ?? "";
      if (variantNewest > bestNewest) best = variant;
    }
  }
  return best;
}

function cellStatusForInstall(
  install: SkillInstall | null,
  target: SkillTarget,
  hasKnownState: boolean,
  primaryHash: string | null,
): SkillCellStatus {
  if (install) {
    if (install.source !== "personal") return "readonly";
    return install.hash === primaryHash ? "in-sync" : "drift";
  }
  if (!target.writable) return "unsupported";
  if (!target.online && !hasKnownState) return "offline";
  return "missing";
}

/**
 * Groups every install by skill name across targets, computing variants, per-target cell
 * state, coverage, and an overall status. Pure so the page can memoize on inputs.
 */
export function buildSkillGroups(environments: readonly SkillEnvironmentInput[]): SkillGroup[] {
  const targets = buildSkillTargets(environments);
  const targetsByKey = new Map(targets.map((target) => [target.key, target]));
  const knownEnvironmentIds = new Set(
    environments.filter((env) => env.inventory !== null).map((env) => env.environmentId),
  );

  const installsByName = new Map<string, SkillVariantInstall[]>();
  for (const env of environments) {
    if (!env.inventory) continue;
    for (const provider of env.inventory.providers) {
      const target = targetsByKey.get(targetKey(env.environmentId, provider.instanceId))!;
      for (const install of provider.skills) {
        const list = installsByName.get(install.name) ?? [];
        list.push({ target, install });
        installsByName.set(install.name, list);
      }
    }
  }

  const groups: SkillGroup[] = [];
  for (const [name, entries] of installsByName) {
    const byHash = new Map<string, SkillVariantInstall[]>();
    const variants: SkillVariant[] = [];
    for (const entry of entries) {
      if (entry.install.hash === null) {
        variants.push({ hash: null, installs: [entry], modifiedAt: entry.install.modifiedAt });
        continue;
      }
      const list = byHash.get(entry.install.hash) ?? [];
      list.push(entry);
      byHash.set(entry.install.hash, list);
    }
    for (const [hash, list] of byHash) {
      variants.push({ hash, installs: list, modifiedAt: newestModifiedAt(list) });
    }

    const primaryVariant = pickPrimaryVariant(variants);
    const primaryHash = primaryVariant.hash;
    const primaryInstall = primaryVariant.installs[0]!.install;

    let source: SkillSource = entries[0]!.install.source;
    for (const entry of entries) {
      if (SOURCE_RANK[entry.install.source] < SOURCE_RANK[source]) source = entry.install.source;
    }
    const hasGapEligibleInstall = entries.some(
      (entry) => entry.install.source === "personal" || entry.install.source === "shared",
    );

    const installByTargetKey = new Map(entries.map((entry) => [entry.target.key, entry.install]));
    // A skill on disk in a shared skills directory belongs to every instance pointed at
    // that directory, even if only one of them reported it in its snapshot.
    const installByDirKey = new Map<string, SkillInstall>();
    for (const entry of entries) {
      if (!entry.target.skillsDirectory) continue;
      const dirKey = directoryKey(entry.target.environmentId, entry.target.skillsDirectory);
      if (!installByDirKey.has(dirKey)) installByDirKey.set(dirKey, entry.install);
    }
    const cells = new Map<string, SkillCell>();
    let hasMissing = false;
    let hasDrift = false;
    let installedCount = 0;
    let expectedCount = 0;
    for (const target of targets) {
      let install = installByTargetKey.get(target.key) ?? null;
      if (!install && target.skillsDirectory) {
        install =
          installByDirKey.get(directoryKey(target.environmentId, target.skillsDirectory)) ?? null;
      }
      const hasKnownState = knownEnvironmentIds.has(target.environmentId);
      const status = cellStatusForInstall(install, target, hasKnownState, primaryHash);
      cells.set(target.key, { status, install });
      if (install) installedCount += 1;
      if (install || target.writable) expectedCount += 1;
      if (status === "missing") hasMissing = true;
      if (status === "drift") hasDrift = true;
    }

    const status: SkillStatus =
      hasGapEligibleInstall && hasMissing
        ? "gaps"
        : hasDrift
          ? "drift"
          : hasGapEligibleInstall
            ? "in-sync"
            : "readonly";

    const description =
      primaryInstall.description ??
      entries.find((entry) => entry.install.description)?.install.description;

    groups.push({
      name,
      description,
      source,
      variants,
      primaryVariant,
      cells,
      coverage: { installed: installedCount, expected: expectedCount },
      status,
    });
  }

  return groups.toSorted((a, b) => a.name.localeCompare(b.name));
}

export type SkillSourceFilter = "all" | SkillSource;
export type SkillStatusFilter = "all" | "gaps" | "drift" | "in-sync";

export interface SkillFilters {
  search: string;
  source: SkillSourceFilter;
  environmentId: string | null;
  instanceId: string | null;
  status: SkillStatusFilter;
}

export const DEFAULT_SKILL_FILTERS: SkillFilters = {
  search: "",
  source: "all",
  environmentId: null,
  instanceId: null,
  status: "all",
};

/** Ranks and filters skills for the library list. Search reuses the chat picker's scorer. */
export function filterSkillGroups(
  groups: readonly SkillGroup[],
  filters: SkillFilters,
): SkillGroup[] {
  const filtered = groups.filter((group) => {
    if (filters.source !== "all" && group.source !== filters.source) return false;
    if (filters.status !== "all" && group.status !== filters.status) return false;
    if (filters.environmentId || filters.instanceId) {
      const matchesTarget = [...group.cells.entries()].some(([key, cell]) => {
        if (cell.install === null) return false;
        const [environmentId, instanceId] = key.split(":");
        if (filters.environmentId && environmentId !== filters.environmentId) return false;
        if (filters.instanceId && instanceId !== filters.instanceId) return false;
        return true;
      });
      if (!matchesTarget) return false;
    }
    return true;
  });

  if (!filters.search.trim()) return filtered;

  return filtered
    .map((group) => ({
      group,
      score: scoreChatPickerMatch(group.name, [group.description], filters.search),
    }))
    .filter((entry): entry is { group: SkillGroup; score: number } => entry.score !== null)
    .toSorted((a, b) => a.score - b.score)
    .map((entry) => entry.group);
}

export function sourceCounts(groups: readonly SkillGroup[]): Record<SkillSourceFilter, number> {
  const counts: Record<SkillSourceFilter, number> = {
    all: groups.length,
    personal: 0,
    shared: 0,
    builtin: 0,
    project: 0,
  };
  for (const group of groups) counts[group.source] += 1;
  return counts;
}

const PROVIDER_SPECIFIC_FRONTMATTER_KEYS = new Set([
  "allowed-tools",
  "disable-model-invocation",
  "user-invocable",
  "model",
  "context",
  "agent",
  "hooks",
]);

const EXECUTABLE_SCRIPT_EXTENSIONS = [".sh", ".py", ".js", ".ts", ".rb"];

/** Parses only the leading `--- ... ---` frontmatter block; ignores the body. */
function parseFrontmatterKeys(skillMdText: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMdText);
  if (!match) return [];
  const keys: string[] = [];
  for (const line of match[1]!.split(/\r?\n/)) {
    const keyMatch = /^([A-Za-z0-9_-]+):/.exec(line);
    if (keyMatch) keys.push(keyMatch[1]!);
  }
  return keys;
}

/** Splits a SKILL.md into its frontmatter key/value pairs and body text. */
export function parseSkillMd(skillMdText: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(skillMdText);
  if (!match) return { frontmatter: {}, body: skillMdText };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (pair) frontmatter[pair[1]!] = pair[2]!.trim();
  }
  return { frontmatter, body: match[2] ?? "" };
}

/**
 * Flags frontmatter keys that only make sense on Claude (allowed-tools, hooks, ...) when the
 * install target is a different driver, and flags bundles that carry executable scripts.
 */
export function frontmatterWarnings(
  skillMdText: string,
  targetDriver: string,
  filePaths: readonly string[] = [],
): string[] {
  const warnings: string[] = [];
  if (targetDriver !== "claudeAgent") {
    const keys = parseFrontmatterKeys(skillMdText).filter((key) =>
      PROVIDER_SPECIFIC_FRONTMATTER_KEYS.has(key),
    );
    if (keys.length > 0) {
      warnings.push(
        `Frontmatter uses ${keys.join(", ")}, which ${targetDriver} may not understand.`,
      );
    }
  }
  const scripts = filePaths.filter((path) =>
    EXECUTABLE_SCRIPT_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)),
  );
  if (scripts.length > 0) {
    warnings.push(
      `Includes ${scripts.length} script file${scripts.length === 1 ? "" : "s"} that will run as instructions on the target.`,
    );
  }
  return warnings;
}

export type LineDiffOp =
  | { kind: "equal"; oldLine: string; newLine: string }
  | { kind: "delete"; oldLine: string }
  | { kind: "insert"; newLine: string };

/**
 * Minimal LCS-based line diff. Used only as a fallback when no bundled diff renderer fits
 * a plain old-text/new-text comparison; ok for the small SKILL.md-sized files it targets.
 * ponytail: O(n*m) DP, fine for skill-sized files, revisit if diffing large generated files.
 */
export function diffLines(oldText: string, newText: string): LineDiffOp[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const n = oldLines.length;
  const m = newLines.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from<number>({ length: m + 1 }).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: LineDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", oldLine: oldLines[i]!, newLine: newLines[j]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "delete", oldLine: oldLines[i]! });
      i += 1;
    } else {
      ops.push({ kind: "insert", newLine: newLines[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", oldLine: oldLines[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "insert", newLine: newLines[j]! });
    j += 1;
  }
  return ops;
}

export interface BundleFile {
  path: string;
  content: string;
}

export type BundleFileDiff =
  | { kind: "added"; path: string }
  | { kind: "removed"; path: string }
  | { kind: "unchanged"; path: string }
  | { kind: "changed"; path: string; lines: LineDiffOp[] };

/** Per-file diff between two skill bundles: added/removed/unchanged, plus a line diff for changed text files. */
export function diffBundleFiles(
  oldFiles: readonly BundleFile[],
  newFiles: readonly BundleFile[],
): BundleFileDiff[] {
  const oldByPath = new Map(oldFiles.map((file) => [file.path, file.content]));
  const newByPath = new Map(newFiles.map((file) => [file.path, file.content]));
  const allPaths = [...new Set([...oldByPath.keys(), ...newByPath.keys()])].toSorted();

  return allPaths.map((path): BundleFileDiff => {
    const oldContent = oldByPath.get(path);
    const newContent = newByPath.get(path);
    if (oldContent === undefined) return { kind: "added", path };
    if (newContent === undefined) return { kind: "removed", path };
    if (oldContent === newContent) return { kind: "unchanged", path };
    return { kind: "changed", path, lines: diffLines(oldContent, newContent) };
  });
}
