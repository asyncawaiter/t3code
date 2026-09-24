import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig, layerTest as configLayerTest } from "../config.ts";
import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import { ProviderInstanceRegistry } from "../provider/Services/ProviderInstanceRegistry.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { makeSkillLibrary } from "./SkillLibrary.ts";

const driverKind = ProviderDriverKind.make("claudeAgent");
/** sha256("") — matches the hash of an empty (or nonexistent) skill folder. */
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function makeSnapshot(
  instanceId: ProviderInstanceId,
  skills: ReadonlyArray<ServerProviderSkill>,
): ServerProvider {
  return {
    instanceId,
    driver: driverKind,
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills,
  };
}

function makeInstance(input: {
  readonly instanceId: ProviderInstanceId;
  readonly skillsDirectory?: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
}): ProviderInstance {
  const snapshot = makeSnapshot(input.instanceId, input.skills);
  return {
    instanceId: input.instanceId,
    driverKind,
    continuationIdentity: { driverKind, continuationKey: input.instanceId },
    displayName: undefined,
    enabled: true,
    ...(input.skillsDirectory !== undefined ? { skillsDirectory: input.skillsDirectory } : {}),
    snapshot: {
      getSnapshot: Effect.succeed(snapshot),
      resolveMaintenance: () => {
        throw new Error("resolveMaintenance unused in skill library tests");
      },
      refresh: Effect.succeed(snapshot),
      streamChanges: undefined as never,
      applyUsageLimits: () => Effect.void,
    },
    get adapter(): never {
      throw new Error("adapter must not be used by the skill library");
    },
    get textGeneration(): never {
      throw new Error("textGeneration must not be used by the skill library");
    },
  } as ProviderInstance;
}

const writeSkillFolder = Effect.fn("test.writeSkillFolder")(function* (
  directory: string,
  files: Readonly<Record<string, string>>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fileSystem.writeFileString(filePath, content);
  }
});

const makeHarness = Effect.fn("SkillLibrary.test.makeHarness")(function* (input: {
  readonly instances: ReadonlyArray<ProviderInstance>;
}) {
  return yield* makeSkillLibrary().pipe(
    Effect.provide(
      Layer.mergeAll(
        configLayerTest(process.cwd(), { prefix: "t3-skill-library-test-" }),
        Layer.mock(ProviderInstanceRegistry)({
          getInstance: (id) =>
            Effect.succeed(input.instances.find((instance) => instance.instanceId === id)),
          listInstances: Effect.succeed(input.instances),
        }),
        Layer.mock(ProviderRegistry)({
          refreshInstance: () => Effect.succeed([]),
        }),
      ),
    ),
  );
});

describe("SkillLibrary", () => {
  it.effect("hashes match between list and read for the same content", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-personal");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      yield* writeSkillFolder(path.join(skillsDirectory, "foo"), {
        "SKILL.md": "---\nname: foo\n---\nBody text.\n",
        "notes.txt": "hello world",
      });
      const skill: ServerProviderSkill = {
        name: "foo",
        path: path.join(skillsDirectory, "foo", "SKILL.md"),
        enabled: true,
      };
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [skill] });
      const library = yield* makeHarness({ instances: [instance] });

      const inventory = yield* library.list();
      const install = inventory.providers[0]?.skills.find((entry) => entry.name === "foo");
      assert.isDefined(install);
      assert.isNotNull(install?.hash);
      assert.equal(install?.fileCount, 2);
      assert.equal(install?.source, "personal");

      const bundle = yield* library.read({ instanceId, name: "foo" });
      assert.equal(bundle.hash, install?.hash);
      assert.equal(bundle.files.length, 2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("classifies personal, shared, project, and builtin sources", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-classify");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const sharedDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-shared-",
      });
      const projectDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-project-",
      });

      yield* writeSkillFolder(path.join(skillsDirectory, "personal-skill"), {
        "SKILL.md": "personal",
      });
      yield* writeSkillFolder(path.join(sharedDirectory, "shared-skill"), { "SKILL.md": "shared" });
      yield* writeSkillFolder(path.join(projectDirectory, "project-skill"), {
        "SKILL.md": "project",
      });
      yield* writeSkillFolder(path.join(sharedDirectory, "plugins", "builtin-skill"), {
        "SKILL.md": "builtin",
      });

      const skills: ReadonlyArray<ServerProviderSkill> = [
        {
          name: "personal-skill",
          path: path.join(skillsDirectory, "personal-skill", "SKILL.md"),
          enabled: true,
        },
        {
          name: "shared-skill",
          path: path.join(sharedDirectory, "shared-skill", "SKILL.md"),
          enabled: true,
        },
        {
          name: "project-skill",
          path: path.join(projectDirectory, "project-skill", "SKILL.md"),
          scope: "project",
          enabled: true,
        },
        {
          name: "builtin-skill",
          path: path.join(sharedDirectory, "plugins", "builtin-skill", "SKILL.md"),
          enabled: true,
        },
      ];
      const instance = makeInstance({ instanceId, skillsDirectory, skills });
      const library = yield* makeHarness({ instances: [instance] });

      const inventory = yield* library.list();
      const byName = new Map(inventory.providers[0]?.skills.map((entry) => [entry.name, entry]));
      assert.equal(byName.get("personal-skill")?.source, "personal");
      assert.equal(byName.get("shared-skill")?.source, "shared");
      assert.equal(byName.get("project-skill")?.source, "project");
      assert.equal(byName.get("builtin-skill")?.source, "builtin");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("writes into an empty slot", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-write");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const result = yield* library.write({
        instanceId,
        name: "bar",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "---\nname: bar\n---\n" }],
        expectedHash: null,
      });

      assert.equal(result.install.name, "bar");
      assert.isNull(result.backup);
      const written = yield* fileSystem.readFileString(
        path.join(skillsDirectory, "bar", "SKILL.md"),
      );
      assert.equal(written, "---\nname: bar\n---\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a write with a stale expected hash as a conflict", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const instanceId = ProviderInstanceId.make("claude-conflict");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      yield* library.write({
        instanceId,
        name: "bar",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "v1" }],
        expectedHash: null,
      });

      const failure = yield* Effect.flip(
        library.write({
          instanceId,
          name: "bar",
          files: [{ path: "SKILL.md", encoding: "utf8", content: "v2" }],
          expectedHash: "not-the-real-hash",
        }),
      );
      assert.equal(failure.reason, "conflict");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("backs up an update and restores the previous content", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-update");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const created = yield* library.write({
        instanceId,
        name: "bar",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "original" }],
        expectedHash: null,
      });

      const updated = yield* library.write({
        instanceId,
        name: "bar",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "changed" }],
        expectedHash: created.install.hash,
      });
      assert.isNotNull(updated.backup);

      const afterUpdate = yield* fileSystem.readFileString(
        path.join(skillsDirectory, "bar", "SKILL.md"),
      );
      assert.equal(afterUpdate, "changed");

      const restored = yield* library.restore({ backupId: updated.backup!.id });
      const afterRestore = yield* fileSystem.readFileString(
        path.join(skillsDirectory, "bar", "SKILL.md"),
      );
      assert.equal(afterRestore, "original");
      assert.equal(restored.install.hash, created.install.hash);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a file path that escapes the skill folder", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const instanceId = ProviderInstanceId.make("claude-traversal");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const failure = yield* Effect.flip(
        library.write({
          instanceId,
          name: "bar",
          files: [{ path: "../x", encoding: "utf8", content: "evil" }],
          expectedHash: null,
        }),
      );
      assert.equal(failure.reason, "invalid");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a remove whose name is not a plain skill name", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-remove-traversal");
      const base = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-base-" });
      const skillsDirectory = path.join(base, "home", ".claude", "skills");
      yield* fileSystem.makeDirectory(skillsDirectory, { recursive: true });
      yield* fileSystem.writeFileString(path.join(base, "home", ".zshrc"), "rc");
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const failure = yield* Effect.flip(
        library.remove({ instanceId, name: "../../.zshrc", expectedHash: EMPTY_SHA256 }),
      );
      assert.equal(failure.reason, "not-found");
      const stillThere = yield* fileSystem
        .exists(path.join(base, "home", ".zshrc"))
        .pipe(Effect.orElseSucceed(() => false));
      assert.isTrue(stillThere);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects removing the skills directory itself via a '.' name", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const instanceId = ProviderInstanceId.make("claude-remove-dot");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const failure = yield* Effect.flip(
        library.remove({ instanceId, name: ".", expectedHash: EMPTY_SHA256 }),
      );
      assert.equal(failure.reason, "not-found");
      const stillThere = yield* fileSystem
        .exists(skillsDirectory)
        .pipe(Effect.orElseSucceed(() => false));
      assert.isTrue(stillThere);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a restore whose backup id does not match the store's id format", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-restore-traversal");
      const base = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-base-" });
      const skillsDirectory = path.join(base, "skills");
      yield* fileSystem.makeDirectory(skillsDirectory, { recursive: true });
      const planted = path.join(base, "planted");
      yield* fileSystem.makeDirectory(planted, { recursive: true });
      yield* fileSystem.writeFileString(path.join(planted, "authorized_keys"), "mine");
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const failure = yield* Effect.flip(library.restore({ backupId: "../../planted" }));
      assert.equal(failure.reason, "not-found");
      const untouched = yield* fileSystem.readFileString(path.join(planted, "authorized_keys"));
      assert.equal(untouched, "mine");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a restore whose backup metadata was tampered to point elsewhere", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-restore-tamper");
      const stateDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-state-" });
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const planted = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-skills-planted-" });
      yield* fileSystem.writeFileString(path.join(planted, "authorized_keys"), "mine");

      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeSkillLibrary().pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ServerConfig, { stateDir } as never),
            Layer.mock(ProviderInstanceRegistry)({
              getInstance: (id) => Effect.succeed(id === instanceId ? instance : undefined),
              listInstances: Effect.succeed([instance]),
            }),
            Layer.mock(ProviderRegistry)({ refreshInstance: () => Effect.succeed([]) }),
          ),
        ),
      );

      const backupId = "1700000000000-deadbeef";
      const backupDir = path.join(stateDir, "skill-backups", backupId);
      yield* fileSystem.makeDirectory(path.join(backupDir, "skill"), { recursive: true });
      yield* fileSystem.writeFileString(path.join(backupDir, "skill", "SKILL.md"), "attacker");
      yield* fileSystem.writeFileString(
        path.join(backupDir, "meta.json"),
        // @effect-diagnostics-next-line preferSchemaOverJson:off - hand-writes a tampered meta.json.
        JSON.stringify({
          id: backupId,
          instanceId,
          name: "evil",
          reason: "remove",
          createdAt: "2026-01-01T00:00:00.000Z",
          // Tampered: points outside this instance's skills directory.
          originalPath: planted,
        }),
      );

      const failure = yield* Effect.flip(library.restore({ backupId }));
      assert.equal(failure.reason, "not-found");
      const untouched = yield* fileSystem.readFileString(path.join(planted, "authorized_keys"));
      assert.equal(untouched, "mine");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a write whose files include a path that is a prefix of another", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-prefix-conflict");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const failure = yield* Effect.flip(
        library.write({
          instanceId,
          name: "foo",
          expectedHash: null,
          files: [
            { path: "SKILL.md", encoding: "utf8", content: "x" },
            { path: "a", encoding: "utf8", content: "file" },
            { path: "a/b", encoding: "utf8", content: "nested" },
          ],
        }),
      );
      assert.equal(failure.reason, "invalid");
      const existsAfter = yield* fileSystem
        .exists(path.join(skillsDirectory, "foo"))
        .pipe(Effect.orElseSucceed(() => false));
      assert.isFalse(existsAfter);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("update preserves .git and node_modules that hashing skips", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-preserve-dotgit");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const folder = path.join(skillsDirectory, "foo");
      yield* writeSkillFolder(folder, {
        "SKILL.md": "v1",
        ".git/HEAD": "ref",
        "node_modules/dep/index.js": "x",
      });
      const skill: ServerProviderSkill = {
        name: "foo",
        path: path.join(folder, "SKILL.md"),
        enabled: true,
      };
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [skill] });
      const library = yield* makeHarness({ instances: [instance] });

      const inventory = yield* library.list();
      const hash = inventory.providers[0]?.skills.find((entry) => entry.name === "foo")?.hash;
      assert.isDefined(hash);

      yield* library.write({
        instanceId,
        name: "foo",
        expectedHash: hash!,
        files: [{ path: "SKILL.md", encoding: "utf8", content: "v2" }],
      });

      const skillMd = yield* fileSystem.readFileString(path.join(folder, "SKILL.md"));
      assert.equal(skillMd, "v2");
      const gitHead = yield* fileSystem
        .readFileString(path.join(folder, ".git", "HEAD"))
        .pipe(Effect.orElseSucceed(() => undefined));
      assert.equal(gitHead, "ref");
      const nodeModules = yield* fileSystem
        .readFileString(path.join(folder, "node_modules", "dep", "index.js"))
        .pipe(Effect.orElseSucceed(() => undefined));
      assert.equal(nodeModules, "x");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("removes a skill and restores it from the backup", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceId = ProviderInstanceId.make("claude-remove");
      const skillsDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-skills-personal-",
      });
      const instance = makeInstance({ instanceId, skillsDirectory, skills: [] });
      const library = yield* makeHarness({ instances: [instance] });

      const created = yield* library.write({
        instanceId,
        name: "baz",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "keep me" }],
        expectedHash: null,
      });

      const removed = yield* library.remove({
        instanceId,
        name: "baz",
        expectedHash: created.install.hash!,
      });
      const existsAfterRemove = yield* fileSystem
        .exists(path.join(skillsDirectory, "baz"))
        .pipe(Effect.orElseSucceed(() => false));
      assert.isFalse(existsAfterRemove);

      yield* library.restore({ backupId: removed.backup.id });
      const restoredContent = yield* fileSystem.readFileString(
        path.join(skillsDirectory, "baz", "SKILL.md"),
      );
      assert.equal(restoredContent, "keep me");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
