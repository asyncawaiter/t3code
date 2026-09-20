// @effect-diagnostics nodeBuiltinImport:off - Native filesystem fixtures exercise directory symlinks and discovery.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { it, expect } from "vite-plus/test";
import { discoverInstructionFiles } from "./instructionFiles.ts";

it("discovers root, parent, scoped and provider sources without following directory symlinks", async () => {
  const parent = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "instructions-test-"));
  try {
    const root = NodePath.join(parent, "repo");
    await NodeFSP.mkdir(NodePath.join(root, "sub"), { recursive: true });
    await NodeFSP.mkdir(NodePath.join(root, ".cursor", "rules"), { recursive: true });
    await NodeFSP.mkdir(NodePath.join(root, "node_modules"), { recursive: true });
    await NodeFSP.mkdir(NodePath.join(parent, "external"));
    for (const file of [
      "AGENTS.md",
      "repo/AGENTS.md",
      "repo/CLAUDE.md",
      "repo/sub/AGENTS.md",
      "repo/.cursor/rules/style.mdc",
      "repo/node_modules/AGENTS.md",
      "external/AGENTS.md",
    ])
      await NodeFSP.writeFile(NodePath.join(parent, file), "# Instructions\n\nKeep tests green.");
    await NodeFSP.symlink(
      NodePath.join(parent, "external"),
      NodePath.join(root, "linked"),
      "junction",
    );
    const result = await discoverInstructionFiles(root);
    // macOS /tmp resolves to /private/tmp.
    const canonical = await NodeFSP.realpath(parent);
    const local = result.files.filter((file) => file.path.startsWith(canonical + NodePath.sep));
    expect(
      local.map((file) => [
        NodePath.relative(canonical, file.path).split(NodePath.sep).join("/"),
        file.scope,
      ]),
    ).toEqual([
      ["AGENTS.md", "parent"],
      ["repo/.cursor/rules/style.mdc", "subfolder"],
      ["repo/AGENTS.md", "root"],
      ["repo/CLAUDE.md", "root"],
      ["repo/sub/AGENTS.md", "subfolder"],
    ]);
    expect(result.truncated).toBe(false);
    await expect(discoverInstructionFiles(NodePath.join(parent, "missing"))).rejects.toThrow();
  } finally {
    await NodeFSP.rm(parent, { recursive: true, force: true });
  }
});

it("reports partial discovery when the instruction file limit is reached", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "instructions-limit-"));
  try {
    const rules = NodePath.join(root, ".claude", "rules");
    await NodeFSP.mkdir(rules, { recursive: true });
    await Promise.all(
      Array.from({ length: 210 }, (_, i) =>
        NodeFSP.writeFile(NodePath.join(rules, `${i}.md`), "rule"),
      ),
    );
    const result = await discoverInstructionFiles(root);
    expect(result.truncated).toBe(true);
    expect(result.files.length).toBe(200);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
