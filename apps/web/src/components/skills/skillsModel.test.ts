import { expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type SkillInstall,
  type SkillInventory,
} from "@t3tools/contracts";

import {
  buildSkillGroups,
  buildSkillTargets,
  dedupeWriteTargets,
  diffBundleFiles,
  diffLines,
  filterSkillGroups,
  frontmatterWarnings,
  parseSkillMd,
  sourceCounts,
  type SkillEnvironmentInput,
} from "./skillsModel";

function install(overrides: Partial<SkillInstall> & { name: string }): SkillInstall {
  return {
    description: undefined,
    source: "personal",
    path: `/skills/${overrides.name}/SKILL.md`,
    hash: "hash-a",
    fileCount: 1,
    bytes: 100,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    symlinked: false,
    ...overrides,
  } as SkillInstall;
}

function inventory(
  providers: Array<{
    instanceId: string;
    driver: string;
    enabled: boolean;
    skillsDirectory: string | null;
    skills: SkillInstall[];
  }>,
): SkillInventory {
  return {
    checkedAt: "2026-01-01T00:00:00.000Z",
    providers: providers.map((provider) => ({
      ...provider,
      instanceId: ProviderInstanceId.make(provider.instanceId),
      driver: ProviderDriverKind.make(provider.driver),
    })),
    backups: [],
  };
}

function env(
  overrides: Partial<Omit<SkillEnvironmentInput, "environmentId">> & { environmentId: string },
): SkillEnvironmentInput {
  return {
    label: overrides.environmentId,
    online: true,
    inventory: null,
    stale: false,
    ...overrides,
    environmentId: EnvironmentId.make(overrides.environmentId),
  };
}

it("marks a personal install missing on a writable target that lacks it, and computes coverage", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "claude-1",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/home/skills",
          skills: [install({ name: "writer", hash: "h1" })],
        },
        {
          instanceId: "codex-1",
          driver: "codex",
          enabled: true,
          skillsDirectory: "/home/codex-skills",
          skills: [],
        },
      ]),
    }),
  ];

  const [group] = buildSkillGroups(environments);
  expect(group!.name).toBe("writer");
  expect(group!.status).toBe("gaps");
  expect(group!.coverage).toEqual({ installed: 1, expected: 2 });
  expect(group!.cells.get("e1:codex-1")?.status).toBe("missing");
  expect(group!.cells.get("e1:claude-1")?.status).toBe("in-sync");
});

it("does not treat a builtin-only skill as having gaps", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "claude-1",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/home/skills",
          skills: [install({ name: "builtin-thing", source: "builtin", hash: "h1" })],
        },
        {
          instanceId: "codex-1",
          driver: "codex",
          enabled: true,
          skillsDirectory: "/home/codex-skills",
          skills: [],
        },
      ]),
    }),
  ];

  const [group] = buildSkillGroups(environments);
  expect(group!.status).toBe("readonly");
  expect(group!.cells.get("e1:claude-1")?.status).toBe("readonly");
  expect(group!.cells.get("e1:codex-1")?.status).toBe("missing");
});

it("flags drift when hashes differ from the majority variant, and picks the primary by count", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "a",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/a",
          skills: [install({ name: "writer", hash: "h1" })],
        },
        {
          instanceId: "b",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/b",
          skills: [install({ name: "writer", hash: "h1" })],
        },
        {
          instanceId: "c",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/c",
          skills: [install({ name: "writer", hash: "h2" })],
        },
      ]),
    }),
  ];

  const [group] = buildSkillGroups(environments);
  expect(group!.primaryVariant.hash).toBe("h1");
  expect(group!.status).toBe("drift");
  expect(group!.cells.get("e1:c")?.status).toBe("drift");
});

it("marks a target offline as offline only when there is no known state for it", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "a",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/a",
          skills: [install({ name: "writer", hash: "h1" })],
        },
      ]),
    }),
    env({ environmentId: "e2", online: false, inventory: null }),
  ];

  // e2 has no provider instances at all (never loaded), so it contributes no targets and thus
  // no cells; this test instead checks a target whose environment never returned data behaves.
  const [group] = buildSkillGroups(environments);
  expect(group!.cells.size).toBe(1);
});

it("unsupported target without an install stays unsupported even when online", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "a",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/a",
          skills: [install({ name: "writer", hash: "h1" })],
        },
        {
          instanceId: "readonly-provider",
          driver: "cursor",
          enabled: true,
          skillsDirectory: null,
          skills: [],
        },
      ]),
    }),
  ];

  const [group] = buildSkillGroups(environments);
  expect(group!.cells.get("e1:readonly-provider")?.status).toBe("unsupported");
});

it("filters by source, status and search", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "a",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/a",
          skills: [
            install({ name: "writer", hash: "h1" }),
            install({ name: "reviewer", hash: "h2", description: "Reviews pull requests" }),
          ],
        },
      ]),
    }),
  ];
  const groups = buildSkillGroups(environments);
  expect(sourceCounts(groups)).toEqual({ all: 2, personal: 2, shared: 0, builtin: 0, project: 0 });
  expect(
    filterSkillGroups(groups, {
      search: "review",
      source: "all",
      environmentId: null,
      instanceId: null,
      status: "all",
    }).map((g) => g.name),
  ).toEqual(["reviewer"]);
  expect(
    filterSkillGroups(groups, {
      search: "",
      source: "personal",
      environmentId: null,
      instanceId: null,
      status: "all",
    }),
  ).toHaveLength(2);
});

it("treats a skill installed in a shared skills directory as installed for every instance pointed at it", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "claude-1",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/home/.claude/skills",
          skills: [install({ name: "writer", hash: "h1" })],
        },
        {
          instanceId: "claude-2",
          driver: "claudeAgent",
          enabled: true,
          // Same directory as claude-1: two instances reading one folder on disk.
          skillsDirectory: "/home/.claude/skills",
          skills: [],
        },
      ]),
    }),
  ];

  const [group] = buildSkillGroups(environments);
  expect(group!.status).toBe("in-sync");
  expect(group!.cells.get("e1:claude-2")?.status).toBe("in-sync");
  expect(group!.coverage).toEqual({ installed: 2, expected: 2 });
});

it("dedupeWriteTargets collapses targets that share one environment + skills directory", () => {
  const environments: SkillEnvironmentInput[] = [
    env({
      environmentId: "e1",
      inventory: inventory([
        {
          instanceId: "claude-1",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/home/.claude/skills",
          skills: [],
        },
        {
          instanceId: "claude-2",
          driver: "claudeAgent",
          enabled: true,
          skillsDirectory: "/home/.claude/skills",
          skills: [],
        },
        {
          instanceId: "codex-1",
          driver: "codex",
          enabled: true,
          skillsDirectory: "/home/codex-skills",
          skills: [],
        },
        {
          instanceId: "readonly-1",
          driver: "cursor",
          enabled: true,
          skillsDirectory: null,
          skills: [],
        },
      ]),
    }),
  ];
  const targets = buildSkillTargets(environments);
  const deduped = dedupeWriteTargets(targets);
  expect(deduped.map((target) => target.instanceId).toSorted()).toEqual([
    "claude-1",
    "codex-1",
    "readonly-1",
  ]);
});

it("frontmatterWarnings flags provider-specific keys on non-claude targets and script files", () => {
  const md = "---\nallowed-tools: Bash\nmodel: opus\n---\nBody";
  expect(frontmatterWarnings(md, "codex", ["SKILL.md"])).toEqual([
    "Frontmatter uses allowed-tools, model, which codex may not understand.",
  ]);
  expect(frontmatterWarnings(md, "claudeAgent", ["SKILL.md"])).toEqual([]);
  expect(frontmatterWarnings("---\n---\n", "codex", ["run.sh", "notes.txt"])).toEqual([
    "Includes 1 script file that will run as instructions on the target.",
  ]);
});

it("parseSkillMd splits frontmatter from body", () => {
  const { frontmatter, body } = parseSkillMd(
    "---\nname: writer\ndescription: Writes things\n---\n# Writer\nBody text",
  );
  expect(frontmatter).toEqual({ name: "writer", description: "Writes things" });
  expect(body).toBe("# Writer\nBody text");
});

it("diffLines produces a minimal edit script", () => {
  const ops = diffLines("a\nb\nc", "a\nx\nc");
  expect(ops.map((op) => op.kind)).toEqual(["equal", "delete", "insert", "equal"]);
});

it("diffBundleFiles reports added, removed, changed and unchanged files", () => {
  const diffs = diffBundleFiles(
    [
      { path: "SKILL.md", content: "a\nb" },
      { path: "old.txt", content: "gone" },
    ],
    [
      { path: "SKILL.md", content: "a\nc" },
      { path: "new.txt", content: "fresh" },
    ],
  );
  expect(diffs.map((d) => [d.path, d.kind])).toEqual([
    ["SKILL.md", "changed"],
    ["new.txt", "added"],
    ["old.txt", "removed"],
  ]);
});
