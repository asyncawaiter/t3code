/**
 * SkillLibrary — cross-provider skill inventory, read, write, remove, and
 * restore, backed by a small on-disk backup store.
 *
 * A "skill" is whatever a provider's own snapshot (`ServerProvider.skills`)
 * reports. When a skill's reported path is a `SKILL.md`, T3 treats its
 * parent folder as the installable unit: it can be hashed, downloaded, and
 * (when the folder sits directly under the instance's `skillsDirectory`)
 * written back or removed. Skills without a `SKILL.md` path (bare files, or
 * an ACP-reported catalog entry with no on-disk folder) are read-only:
 * they show up with a null hash and zero counts.
 *
 * Every mutation goes through a stage-then-swap: new content is written to
 * a throwaway folder first, and only renamed into place once it's fully on
 * disk, so a crash mid-write never leaves a half-written skill behind. The
 * previous folder (if any) is always preserved in the backup store before
 * being replaced, so `restore` can undo an update or a removal.
 *
 * @module skills/SkillLibrary
 */
import {
  ProviderInstanceId,
  type SkillBackup,
  type SkillFile,
  type SkillInstall,
  type SkillInventory,
  type SkillProviderInventory,
  SkillLibraryError,
  type SkillReadInput,
  type SkillRemoveInput,
  type SkillRestoreInput,
  type SkillSource,
  type SkillWriteInput,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { ServerConfig } from "../config.ts";
import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import { ProviderInstanceRegistry } from "../provider/Services/ProviderInstanceRegistry.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** Exact shape `makeBackupStore.create` generates: epoch millis, `-`, 8 hex chars. */
const BACKUP_ID_PATTERN = /^[0-9]+-[0-9a-f]{8}$/;
const MAX_FILES = 300;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 8;
const MAX_BACKUPS = 50;
const SKIPPED_ENTRIES = new Set([".git", "node_modules", ".DS_Store"]);
const PROJECT_SCOPES = new Set(["project", "repo", "workspace"]);
const BUILTIN_SCOPES = new Set(["system", "builtin", "plugin", "admin"]);

const invalid = (detail: string) => new SkillLibraryError({ reason: "invalid", detail });
const notFound = (detail: string) => new SkillLibraryError({ reason: "not-found", detail });
const conflict = (detail: string) => new SkillLibraryError({ reason: "conflict", detail });
const unsupported = (detail: string) => new SkillLibraryError({ reason: "unsupported", detail });
const tooLarge = (detail: string) => new SkillLibraryError({ reason: "too-large", detail });
const ioError = (detail: string) => new SkillLibraryError({ reason: "io", detail });

const asIo =
  (detail: string) =>
  (cause: unknown): SkillLibraryError =>
    ioError(`${detail}: ${cause instanceof Error ? cause.message : String(cause)}`);

// ---------------------------------------------------------------------------
// Folder scanning + hashing
// ---------------------------------------------------------------------------

interface ScannedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly size: number;
  readonly mtime: Date | undefined;
}

interface ScanResult {
  readonly exists: boolean;
  readonly files: ReadonlyArray<ScannedFile>;
  readonly overLimit: boolean;
}

/**
 * Recursively enumerate a skill folder's regular files, applying the shared
 * scan budget (depth, file count, total bytes) and the symlink containment
 * rule: a symlinked file (or a symlinked subdirectory) is only followed when
 * its realpath stays inside the folder's own realpath, so a skill can't read
 * or hash arbitrary files elsewhere on disk.
 */
const scanSkillFolder = Effect.fn("scanSkillFolder")(function* (
  folder: string,
): Effect.fn.Return<ScanResult, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const rootReal = yield* fileSystem.realPath(folder).pipe(Effect.orElseSucceed(() => undefined));
  if (rootReal === undefined) {
    return { exists: false, files: [], overLimit: false };
  }

  const files: Array<ScannedFile> = [];
  let overLimit = false;
  let totalBytes = 0;
  const visited = new Set<string>();
  const insideRoot = (real: string) =>
    real === rootReal || real.startsWith(`${rootReal}${path.sep}`);

  const visit = Effect.fn("visitSkillFolder")(function* (
    directory: string,
    relativeDirectory: string,
    depth: number,
  ): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
    if (overLimit) return;
    const real = yield* fileSystem.realPath(directory).pipe(Effect.orElseSucceed(() => undefined));
    if (real === undefined || !insideRoot(real) || visited.has(real)) return;
    visited.add(real);
    if (depth > MAX_DEPTH) {
      overLimit = true;
      return;
    }
    const entries = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (entries === undefined) return;

    for (const name of [...entries].sort()) {
      if (overLimit) return;
      if (SKIPPED_ENTRIES.has(name)) continue;
      const childPath = path.join(directory, name);
      const childRelative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const info = yield* fileSystem.stat(childPath).pipe(Effect.orElseSucceed(() => undefined));
      if (info === undefined) continue;
      if (info.type === "Directory") {
        yield* visit(childPath, childRelative, depth + 1);
        continue;
      }
      if (info.type !== "File") continue;
      const childReal = yield* fileSystem
        .realPath(childPath)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (childReal === undefined || !insideRoot(childReal)) continue;
      const size = Number(ByteSize.toBigInt(info.size));
      files.push({
        relativePath: childRelative,
        absolutePath: childPath,
        size,
        mtime: Option.getOrUndefined(info.mtime),
      });
      totalBytes += size;
      if (files.length > MAX_FILES || totalBytes > MAX_BYTES) {
        overLimit = true;
        return;
      }
    }
  });

  yield* visit(folder, "", 0);
  return { exists: true, files, overLimit };
});

const readScannedFiles = Effect.fn("readScannedFiles")(function* (
  files: ReadonlyArray<ScannedFile>,
): Effect.fn.Return<
  ReadonlyArray<{ relativePath: string; bytes: Uint8Array }>,
  SkillLibraryError,
  FileSystem.FileSystem
> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* Effect.all(
    files.map((file) =>
      fileSystem.readFile(file.absolutePath).pipe(
        Effect.map((bytes) => ({ relativePath: file.relativePath, bytes })),
        Effect.mapError(asIo(`Could not read '${file.relativePath}'`)),
      ),
    ),
    { concurrency: 8 },
  );
});

const sortByRelativePath = <T extends { readonly relativePath: string }>(
  entries: ReadonlyArray<T>,
): Array<T> =>
  [...entries].sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
  );

/** sha256 over sorted `relativePath\0bytes\0` entries, shared by list and read so their hashes agree. */
const hashEntries = Effect.fn("hashEntries")(function* (
  entries: ReadonlyArray<{ relativePath: string; bytes: Uint8Array }>,
): Effect.fn.Return<string, never, Crypto.Crypto> {
  const crypto = yield* Crypto.Crypto;
  const encoder = new TextEncoder();
  const chunks: Array<Uint8Array> = [];
  for (const entry of sortByRelativePath(entries)) {
    chunks.push(encoder.encode(`${entry.relativePath}\0`));
    chunks.push(entry.bytes);
    chunks.push(encoder.encode("\0"));
  }
  const combined = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const digest = yield* crypto.digest("SHA-256", combined).pipe(Effect.orDie);
  return Encoding.encodeHex(digest);
});

interface FolderInfo {
  readonly hash: string | null;
  readonly fileCount: number;
  readonly bytes: number;
  readonly modifiedAt: string | null;
  readonly symlinked: boolean;
}

const isSymlink = Effect.fn("isSymlinkSkillFolder")(function* (
  target: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readLink(target).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
});

/** Metadata + hash for `list`. Over-limit folders report accurate counts with a null hash rather than failing. */
const folderInfoForList = Effect.fn("folderInfoForList")(function* (
  folder: string,
): Effect.fn.Return<FolderInfo, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> {
  const scan = yield* scanSkillFolder(folder);
  const symlinked = yield* isSymlink(folder);
  const fileCount = scan.files.length;
  const bytes = scan.files.reduce((total, file) => total + file.size, 0);
  const newest = scan.files.reduce<Date | undefined>(
    (latest, file) => (file.mtime && (!latest || file.mtime > latest) ? file.mtime : latest),
    undefined,
  );
  const modifiedAt = newest ? newest.toISOString() : null;
  if (!scan.exists || scan.overLimit) {
    return { hash: null, fileCount, bytes, modifiedAt, symlinked };
  }
  const contents = yield* readScannedFiles(scan.files).pipe(Effect.orElseSucceed(() => undefined));
  if (contents === undefined) {
    return { hash: null, fileCount, bytes, modifiedAt, symlinked };
  }
  const hash = yield* hashEntries(contents);
  return { hash, fileCount, bytes, modifiedAt, symlinked };
});

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

function classifySource(input: {
  readonly personalDirectoryRaw: string | undefined;
  readonly personalDirectoryReal: string | undefined;
  readonly skillsDirectoryRaw: string | undefined;
  readonly skillsDirectoryReal: string | undefined;
  readonly scope: string | undefined;
  readonly path: string;
}): SkillSource {
  const isPersonal =
    input.personalDirectoryRaw !== undefined &&
    input.skillsDirectoryRaw !== undefined &&
    (input.personalDirectoryRaw === input.skillsDirectoryRaw ||
      (input.personalDirectoryReal !== undefined &&
        input.skillsDirectoryReal !== undefined &&
        input.personalDirectoryReal === input.skillsDirectoryReal));
  if (isPersonal) return "personal";
  const scope = input.scope?.trim().toLowerCase();
  if (scope && PROJECT_SCOPES.has(scope)) return "project";
  if (
    (scope && BUILTIN_SCOPES.has(scope)) ||
    input.path.includes("/plugins/") ||
    input.path.includes("/.system/")
  ) {
    return "builtin";
  }
  return "shared";
}

const buildInstall = Effect.fn("buildSkillInstall")(function* (input: {
  readonly skill: ServerProviderSkill;
  readonly skillsDirectory: string | undefined;
}): Effect.fn.Return<SkillInstall, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> {
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const directory =
    path.basename(input.skill.path) === "SKILL.md" ? path.dirname(input.skill.path) : undefined;

  if (directory === undefined) {
    return {
      name: input.skill.name,
      ...(input.skill.description ? { description: input.skill.description } : {}),
      source: classifySource({
        personalDirectoryRaw: undefined,
        personalDirectoryReal: undefined,
        skillsDirectoryRaw: input.skillsDirectory,
        skillsDirectoryReal: undefined,
        scope: input.skill.scope,
        path: input.skill.path,
      }),
      path: input.skill.path,
      hash: null,
      fileCount: 0,
      bytes: 0,
      modifiedAt: null,
      symlinked: false,
    };
  }

  const info = yield* folderInfoForList(directory);
  const personalDirectoryRaw = path.dirname(directory);
  const personalDirectoryReal = yield* fileSystem
    .realPath(personalDirectoryRaw)
    .pipe(Effect.orElseSucceed(() => undefined));
  const skillsDirectoryReal =
    input.skillsDirectory !== undefined
      ? yield* fileSystem
          .realPath(input.skillsDirectory)
          .pipe(Effect.orElseSucceed(() => undefined))
      : undefined;

  return {
    name: input.skill.name,
    ...(input.skill.description ? { description: input.skill.description } : {}),
    source: classifySource({
      personalDirectoryRaw,
      personalDirectoryReal,
      skillsDirectoryRaw: input.skillsDirectory,
      skillsDirectoryReal,
      scope: input.skill.scope,
      path: input.skill.path,
    }),
    path: input.skill.path,
    hash: info.hash,
    fileCount: info.fileCount,
    bytes: info.bytes,
    modifiedAt: info.modifiedAt,
    symlinked: info.symlinked,
  };
});

// ---------------------------------------------------------------------------
// Write validation
// ---------------------------------------------------------------------------

function validateFilePaths(files: ReadonlyArray<SkillFile>): SkillLibraryError | undefined {
  if (files.length === 0) return invalid("A skill needs at least a SKILL.md file.");
  if (files.length > MAX_FILES)
    return tooLarge(`A skill may not have more than ${MAX_FILES} files.`);
  const seen = new Set<string>();
  const paths: string[] = [];
  let hasSkillMd = false;
  let totalBytes = 0;
  for (const file of files) {
    const filePath = file.path;
    if (
      !filePath ||
      filePath.startsWith("/") ||
      /^[A-Za-z]:/.test(filePath) ||
      filePath.includes("\\") ||
      filePath.includes(":")
    ) {
      return invalid(`Invalid file path '${filePath}'.`);
    }
    const segments = filePath.split("/");
    if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
      return invalid(`Invalid file path '${filePath}'.`);
    }
    if (seen.has(filePath)) return invalid(`Duplicate file path '${filePath}'.`);
    seen.add(filePath);
    paths.push(filePath);
    if (filePath === "SKILL.md") hasSkillMd = true;
    totalBytes +=
      file.encoding === "base64"
        ? Math.ceil((file.content.length * 3) / 4)
        : Buffer.byteLength(file.content, "utf8");
  }
  if (!hasSkillMd) return invalid("A skill needs a SKILL.md file at its root.");
  if (totalBytes > MAX_BYTES) return tooLarge(`A skill may not exceed ${MAX_BYTES} bytes.`);
  // ponytail: O(n^2), fine at MAX_FILES=300; revisit if that budget grows.
  for (const a of paths) {
    for (const b of paths) {
      if (a !== b && b.startsWith(`${a}/`)) {
        return invalid(`Path '${a}' conflicts with '${b}'.`);
      }
    }
  }
  return undefined;
}

function decodeSkillFileBytes(file: SkillFile): Uint8Array {
  return file.encoding === "base64"
    ? Buffer.from(file.content, "base64")
    : Buffer.from(file.content, "utf8");
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function encodeSkillFile(entry: { relativePath: string; bytes: Uint8Array }): SkillFile {
  try {
    return { path: entry.relativePath, encoding: "utf8", content: utf8Decoder.decode(entry.bytes) };
  } catch {
    return {
      path: entry.relativePath,
      encoding: "base64",
      content: Encoding.encodeBase64(entry.bytes),
    };
  }
}

// ---------------------------------------------------------------------------
// Move / copy primitives
// ---------------------------------------------------------------------------

/**
 * Move a folder (or a single symlink) by rename, falling back to copy+remove
 * on `EXDEV` (backup store and skills directory on different devices).
 * ponytail: the fallback dereferences symlinks when copying; upgrade to a
 * symlink-preserving copy if a real deployment ever spans devices here.
 */
const renameOrCopy = Effect.fn("renameOrCopySkillEntry")(function* (
  source: string,
  destination: string,
): Effect.fn.Return<void, SkillLibraryError, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  yield* fileSystem.rename(source, destination).pipe(
    Effect.catchTag("PlatformError", (error) => {
      const cause = error.reason.cause as { code?: string } | undefined;
      if (cause?.code !== "EXDEV") {
        return Effect.fail(asIo("Could not move skill folder")(error));
      }
      return fileSystem
        .copy(source, destination, { preserveTimestamps: true })
        .pipe(
          Effect.mapError(asIo("Could not copy skill folder across devices")),
          Effect.andThen(
            fileSystem
              .remove(source, { recursive: true })
              .pipe(Effect.mapError(asIo("Could not remove source after cross-device move"))),
          ),
        );
    }),
  );
});

// ---------------------------------------------------------------------------
// Backup store
// ---------------------------------------------------------------------------

const BackupMetaSchema = Schema.Struct({
  id: Schema.String,
  instanceId: ProviderInstanceId,
  name: Schema.String,
  reason: Schema.Literals(["update", "remove"]),
  createdAt: Schema.String,
  originalPath: Schema.String,
});
type BackupMeta = typeof BackupMetaSchema.Type;
const BackupMetaJson = Schema.fromJsonString(BackupMetaSchema);
const encodeBackupMeta = Schema.encodeSync(BackupMetaJson);
const decodeBackupMetaEffect = Schema.decodeUnknownEffect(BackupMetaJson);

const toSkillBackup = (meta: BackupMeta): SkillBackup => ({
  id: meta.id,
  instanceId: meta.instanceId,
  name: meta.name,
  reason: meta.reason,
  createdAt: meta.createdAt,
});

const makeBackupStore = Effect.fn("makeSkillBackupStore")(function* (backupsDir: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;

  const entryDir = (id: string) => path.join(backupsDir, id);
  const metaPath = (id: string) => path.join(entryDir(id), "meta.json");
  const skillPath = (id: string) => path.join(entryDir(id), "skill");

  const readMeta = (id: string) =>
    fileSystem.readFileString(metaPath(id)).pipe(
      Effect.flatMap(decodeBackupMetaEffect),
      Effect.orElseSucceed(() => undefined),
    );

  const list = Effect.fn("listSkillBackups")(function* (): Effect.fn.Return<
    ReadonlyArray<BackupMeta>,
    never,
    never
  > {
    const ids = yield* fileSystem
      .readDirectory(backupsDir)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const metas = yield* Effect.all(
      ids.map((id) => readMeta(id)),
      { concurrency: 8 },
    );
    return metas
      .filter((meta): meta is BackupMeta => meta !== undefined)
      .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  });

  const prune = Effect.fn("pruneSkillBackups")(function* () {
    const metas = yield* list();
    for (const stale of metas.slice(MAX_BACKUPS)) {
      yield* fileSystem
        .remove(entryDir(stale.id), { recursive: true, force: true })
        .pipe(Effect.orElseSucceed(() => undefined));
    }
  });

  /**
   * Preserve a skill folder (or symlink) in the backup store. `move: true`
   * renames the source away (used for removals and for replacing a plain
   * directory); `move: false` copies it, leaving the source in place (used
   * when the caller still needs to clear and replace that same path, e.g.
   * a symlink's resolved directory).
   */
  const create = Effect.fn("createSkillBackup")(function* (input: {
    readonly instanceId: ProviderInstanceId;
    readonly name: string;
    readonly reason: "update" | "remove";
    readonly originalPath: string;
    readonly source: string;
    readonly move: boolean;
  }) {
    const now = yield* DateTime.now;
    const suffix = (yield* crypto.randomUUIDv4.pipe(Effect.orDie)).replace(/-/g, "").slice(0, 8);
    const id = `${DateTime.toEpochMillis(now)}-${suffix}`;
    yield* fileSystem
      .makeDirectory(entryDir(id), { recursive: true })
      .pipe(Effect.mapError(asIo("Could not create backup directory")));
    if (input.move) {
      yield* renameOrCopy(input.source, skillPath(id));
    } else {
      yield* fileSystem
        .copy(input.source, skillPath(id), { preserveTimestamps: true })
        .pipe(Effect.mapError(asIo("Could not copy skill contents into backup")));
    }
    const meta: BackupMeta = {
      id,
      instanceId: input.instanceId,
      name: input.name,
      reason: input.reason,
      createdAt: DateTime.formatIso(now),
      originalPath: input.originalPath,
    };
    yield* fileSystem
      .writeFileString(metaPath(id), encodeBackupMeta(meta))
      .pipe(Effect.mapError(asIo("Could not write backup metadata")));
    yield* prune();
    return meta;
  });

  const get = Effect.fn("getSkillBackup")(function* (id: string) {
    const meta = yield* readMeta(id);
    if (!meta) return undefined;
    return { meta, skillPath: skillPath(id) };
  });

  const remove = (id: string) =>
    fileSystem
      .remove(entryDir(id), { recursive: true, force: true })
      .pipe(Effect.orElseSucceed(() => undefined));

  return { list, create, get, remove };
});

// ---------------------------------------------------------------------------
// SkillLibrary
// ---------------------------------------------------------------------------

/**
 * Route SkillLibrary RPCs to the provider registry, its instances' file
 * systems, and a small backup store under the server's userdata directory.
 * Follows the `makeProviderInstallation` factory shape: called once from
 * `ws.ts`'s session setup, where all its dependencies are already in scope.
 */
export const makeSkillLibrary = Effect.fn("makeSkillLibrary")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const instances = yield* ProviderInstanceRegistry;
  const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
  const serverConfig = yield* ServerConfig;

  const backupsDir = path.join(serverConfig.stateDir, "skill-backups");
  yield* fileSystem
    .makeDirectory(backupsDir, { recursive: true })
    .pipe(Effect.orElseSucceed(() => undefined));
  const backups = yield* makeBackupStore(backupsDir);
  // ponytail: process-wide lock, one permit; fine at this call volume, move to
  // per-directory locks if concurrent skill writes across instances become common.
  const mutationLock = yield* Semaphore.make(1);

  const requireInstance = Effect.fn("requireSkillInstance")(function* (
    instanceId: ProviderInstanceId,
  ) {
    const instance = yield* instances.getInstance(instanceId);
    if (!instance) return yield* notFound(`Unknown provider instance '${instanceId}'.`);
    return instance;
  });

  const refreshSnapshot = (instanceId: ProviderInstanceId) =>
    providerRegistry.refreshInstance(instanceId).pipe(Effect.asVoid);

  /** Refreshes every instance whose skills directory is the one just mutated, not only the addressed instance. */
  const refreshSnapshotsForDirectory = Effect.fn("refreshSkillSnapshotsForDirectory")(function* (
    skillsDirectory: string | undefined,
  ) {
    if (!skillsDirectory) return;
    const allInstances = yield* instances.listInstances;
    const affected = allInstances.filter(
      (instance) => instance.skillsDirectory === skillsDirectory,
    );
    yield* Effect.all(
      affected.map((instance) => refreshSnapshot(instance.instanceId)),
      { concurrency: 4 },
    );
  });

  /**
   * A backup entry is only trustworthy once its on-disk id, instance, and
   * original path all agree: this is what stops a tampered or hand-crafted
   * `meta.json` from pointing `restore` at an arbitrary path.
   */
  const backupMetaIsValid = (
    id: string,
    meta: BackupMeta,
    instance: ProviderInstance | undefined,
  ): boolean =>
    BACKUP_ID_PATTERN.test(id) &&
    meta.id === id &&
    NAME_PATTERN.test(meta.name) &&
    instance?.skillsDirectory !== undefined &&
    meta.originalPath === path.join(instance.skillsDirectory, meta.name);

  const validBackups = Effect.fn("validSkillBackups")(function* (): Effect.fn.Return<
    ReadonlyArray<BackupMeta>,
    never,
    never
  > {
    const rawBackups = yield* backups.list();
    const result: BackupMeta[] = [];
    for (const meta of rawBackups) {
      const instance = yield* instances.getInstance(meta.instanceId);
      if (backupMetaIsValid(meta.id, meta, instance)) result.push(meta);
    }
    return result;
  });

  const list = Effect.fn("SkillLibrary.list")(function* () {
    const allInstances = yield* instances.listInstances;
    const providerInventories = yield* Effect.all(
      allInstances.map((instance) =>
        Effect.gen(function* () {
          const snapshot = yield* instance.snapshot.getSnapshot;
          const byName = new Map<string, ServerProviderSkill>();
          for (const skill of snapshot.skills) {
            if (!byName.has(skill.name)) byName.set(skill.name, skill);
          }
          const installs = yield* Effect.all(
            [...byName.values()].map((skill) =>
              buildInstall({ skill, skillsDirectory: instance.skillsDirectory }),
            ),
            { concurrency: 4 },
          );
          return {
            instanceId: instance.instanceId,
            driver: instance.driverKind,
            ...(instance.displayName ? { displayName: instance.displayName } : {}),
            enabled: instance.enabled,
            skillsDirectory: instance.skillsDirectory ?? null,
            skills: installs,
          } satisfies SkillProviderInventory;
        }),
      ),
      { concurrency: 4 },
    );
    const backupList = yield* validBackups();
    return {
      checkedAt: DateTime.formatIso(yield* DateTime.now),
      providers: providerInventories,
      backups: backupList.slice(0, MAX_BACKUPS).map(toSkillBackup),
    } satisfies SkillInventory;
  });

  const findSkillDirectory = Effect.fn("findSkillDirectory")(function* (
    instance: ProviderInstance,
    name: string,
  ) {
    const snapshot = yield* instance.snapshot.getSnapshot;
    const skill = snapshot.skills.find((entry) => entry.name === name);
    if (!skill) {
      return yield* notFound(`Unknown skill '${name}' for instance '${instance.instanceId}'.`);
    }
    if (path.basename(skill.path) !== "SKILL.md") {
      return yield* unsupported(`Skill '${name}' has no folder to read.`);
    }
    return { skill, directory: path.dirname(skill.path) };
  });

  const read = Effect.fn("SkillLibrary.read")(function* (input: SkillReadInput) {
    const instance = yield* requireInstance(input.instanceId);
    if (!NAME_PATTERN.test(input.name)) {
      return yield* notFound(
        `Unknown skill '${input.name}' for instance '${instance.instanceId}'.`,
      );
    }
    const { directory } = yield* findSkillDirectory(instance, input.name);
    const scan = yield* scanSkillFolder(directory);
    if (!scan.exists) return yield* notFound(`Skill '${input.name}' folder is missing on disk.`);
    if (scan.overLimit) return yield* tooLarge(`Skill '${input.name}' is too large to read.`);
    const contents = yield* readScannedFiles(scan.files);
    const hash = yield* hashEntries(contents);
    const files = sortByRelativePath(contents).map(encodeSkillFile);
    return { name: input.name, hash, files };
  });

  /**
   * On a failed final move, put the just-created backup back where it came
   * from and drop the backup entry, so a write that fails partway never
   * leaves the skill missing from both its live location and the backup list.
   * The half-written placement is cleared first; the backup entry is only
   * dropped once the move back succeeded, otherwise it stays restorable.
   */
  const restoreBackupOnFailure = (meta: BackupMeta, placementPath: string) =>
    Effect.gen(function* () {
      const record = yield* backups.get(meta.id);
      if (!record) return;
      yield* fileSystem.remove(placementPath, { recursive: true, force: true });
      yield* renameOrCopy(record.skillPath, placementPath);
      yield* backups.remove(meta.id);
    }).pipe(Effect.orElseSucceed(() => undefined));

  const write = Effect.fn("SkillLibrary.write")(function* (input: SkillWriteInput) {
    const instance = yield* requireInstance(input.instanceId);
    const skillsDirectory = instance.skillsDirectory;
    if (!skillsDirectory) {
      return yield* unsupported(`Instance '${input.instanceId}' has no personal skills directory.`);
    }
    if (!NAME_PATTERN.test(input.name)) {
      return yield* invalid(`Invalid skill name '${input.name}'.`);
    }
    const validationError = validateFilePaths(input.files);
    if (validationError) return yield* validationError;

    return yield* mutationLock.withPermits(1)(
      Effect.gen(function* () {
        const target = path.join(skillsDirectory, input.name);
        const targetExists = yield* fileSystem
          .exists(target)
          .pipe(Effect.orElseSucceed(() => false));
        const currentInfo = targetExists ? yield* folderInfoForList(target) : undefined;

        if (input.expectedHash === null) {
          if (targetExists) return yield* conflict(`Skill '${input.name}' already exists.`);
        } else if (!targetExists || currentInfo?.hash !== input.expectedHash) {
          return yield* conflict(`Skill '${input.name}' changed since it was last read.`);
        }

        const suffix = (yield* crypto.randomUUIDv4.pipe(Effect.orDie))
          .replace(/-/g, "")
          .slice(0, 8);
        // Staged outside the skills directory so a crash mid-write can never
        // leave stray `.t3-staging-*` folders visible to the provider.
        const stagingParent = path.join(serverConfig.stateDir, "skill-staging", suffix);
        const stagingDir = path.join(stagingParent, input.name);

        const body = Effect.gen(function* () {
          yield* fileSystem
            .makeDirectory(stagingDir, { recursive: true })
            .pipe(Effect.mapError(asIo("Could not create staging directory")));
          for (const file of input.files) {
            const filePath = path.join(stagingDir, file.path);
            const relativeToStaging = path.relative(stagingDir, filePath);
            if (relativeToStaging.startsWith("..") || path.isAbsolute(relativeToStaging)) {
              return yield* invalid(`Invalid file path '${file.path}'.`);
            }
            yield* fileSystem
              .makeDirectory(path.dirname(filePath), { recursive: true })
              .pipe(Effect.mapError(asIo(`Could not create directory for '${file.path}'`)));
            yield* fileSystem
              .writeFile(filePath, decodeSkillFileBytes(file))
              .pipe(Effect.mapError(asIo(`Could not write '${file.path}'`)));
          }

          let backup: SkillBackup | null = null;
          if (targetExists) {
            const linked = yield* isSymlink(target);
            if (linked) {
              const resolvedTarget = yield* fileSystem
                .realPath(target)
                .pipe(Effect.mapError(asIo("Could not resolve skill symlink")));
              const meta = yield* backups.create({
                instanceId: input.instanceId,
                name: input.name,
                reason: "update",
                originalPath: target,
                source: resolvedTarget,
                move: false,
              });
              backup = toSkillBackup(meta);
              // Clear everything except entries hashing skips (.git, node_modules, ...)
              // so an update through a symlink doesn't drop them.
              const currentEntries = yield* fileSystem
                .readDirectory(resolvedTarget)
                .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
              for (const name of currentEntries) {
                if (SKIPPED_ENTRIES.has(name)) continue;
                yield* fileSystem
                  .remove(path.join(resolvedTarget, name), { recursive: true, force: true })
                  .pipe(Effect.mapError(asIo("Could not clear linked skill directory")));
              }
              const stagedEntries = yield* fileSystem
                .readDirectory(stagingDir)
                .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
              yield* Effect.forEach(
                stagedEntries,
                (name) =>
                  renameOrCopy(path.join(stagingDir, name), path.join(resolvedTarget, name)).pipe(
                    Effect.tapError(() => restoreBackupOnFailure(meta, resolvedTarget)),
                  ),
                { discard: true },
              );
            } else {
              const meta = yield* backups.create({
                instanceId: input.instanceId,
                name: input.name,
                reason: "update",
                originalPath: target,
                source: target,
                move: true,
              });
              backup = toSkillBackup(meta);
              yield* renameOrCopy(stagingDir, target).pipe(
                Effect.tapError(() => restoreBackupOnFailure(meta, target)),
              );
              // Carry over entries hashing skips (.git, node_modules, ...) from the
              // backed-up folder, since the staged content never had them.
              const record = yield* backups.get(meta.id);
              if (record) {
                for (const name of SKIPPED_ENTRIES) {
                  const oldPath = path.join(record.skillPath, name);
                  const hasEntry = yield* fileSystem
                    .exists(oldPath)
                    .pipe(Effect.orElseSucceed(() => false));
                  if (!hasEntry) continue;
                  yield* fileSystem
                    .copy(oldPath, path.join(target, name), { preserveTimestamps: true })
                    .pipe(Effect.orElseSucceed(() => undefined));
                }
              }
            }
          } else {
            yield* fileSystem
              .makeDirectory(skillsDirectory, { recursive: true })
              .pipe(Effect.mapError(asIo("Could not create skills directory")));
            yield* renameOrCopy(stagingDir, target);
          }
          return backup;
        });

        const backup = yield* body.pipe(
          Effect.ensuring(
            fileSystem
              .remove(stagingParent, { recursive: true, force: true })
              .pipe(Effect.orElseSucceed(() => undefined)),
          ),
        );

        yield* refreshSnapshotsForDirectory(skillsDirectory);

        const info = yield* folderInfoForList(target);
        const install: SkillInstall = {
          name: input.name,
          source: "personal",
          path: path.join(target, "SKILL.md"),
          hash: info.hash,
          fileCount: info.fileCount,
          bytes: info.bytes,
          modifiedAt: info.modifiedAt,
          symlinked: info.symlinked,
        };
        return { install, backup };
      }),
    );
  });

  const remove = Effect.fn("SkillLibrary.remove")(function* (input: SkillRemoveInput) {
    const instance = yield* requireInstance(input.instanceId);
    const skillsDirectory = instance.skillsDirectory;
    if (!skillsDirectory) {
      return yield* unsupported(`Instance '${input.instanceId}' has no personal skills directory.`);
    }
    if (!NAME_PATTERN.test(input.name)) {
      return yield* notFound(`Skill '${input.name}' is not installed.`);
    }

    return yield* mutationLock.withPermits(1)(
      Effect.gen(function* () {
        const target = path.join(skillsDirectory, input.name);
        // `stat` follows symlinks, so this rejects a plain file and a
        // symlink-to-file in one check, alongside a genuinely missing target.
        const stat = yield* fileSystem.stat(target).pipe(Effect.orElseSucceed(() => undefined));
        if (stat?.type !== "Directory") {
          return yield* notFound(`Skill '${input.name}' is not installed.`);
        }
        const hasSkillMd = yield* fileSystem
          .exists(path.join(target, "SKILL.md"))
          .pipe(Effect.orElseSucceed(() => false));
        if (!hasSkillMd) return yield* notFound(`Skill '${input.name}' is not installed.`);

        const info = yield* folderInfoForList(target);
        if (info.hash !== input.expectedHash) {
          return yield* conflict(`Skill '${input.name}' changed since it was last read.`);
        }
        // `renameOrCopy` uses `rename`, which moves a symlink itself rather than
        // following it, so this covers both a plain folder and a symlinked one.
        const meta = yield* backups.create({
          instanceId: input.instanceId,
          name: input.name,
          reason: "remove",
          originalPath: target,
          source: target,
          move: true,
        });
        yield* refreshSnapshotsForDirectory(skillsDirectory);
        return { backup: toSkillBackup(meta) };
      }),
    );
  });

  const restore = Effect.fn("SkillLibrary.restore")(function* (input: SkillRestoreInput) {
    if (!BACKUP_ID_PATTERN.test(input.backupId)) {
      return yield* notFound(`Unknown backup '${input.backupId}'.`);
    }

    return yield* mutationLock.withPermits(1)(
      Effect.gen(function* () {
        const record = yield* backups.get(input.backupId);
        if (!record) return yield* notFound(`Unknown backup '${input.backupId}'.`);
        const { meta, skillPath: sourcePath } = record;
        const instance = yield* instances.getInstance(meta.instanceId);
        if (!backupMetaIsValid(input.backupId, meta, instance)) {
          return yield* notFound(`Unknown backup '${input.backupId}'.`);
        }
        const skillsDirectory = instance!.skillsDirectory!;
        const originalPath = meta.originalPath;

        const exists = yield* fileSystem
          .exists(originalPath)
          .pipe(Effect.orElseSucceed(() => false));
        let displaced: SkillBackup | null = null;
        let placementPath = originalPath;

        if (exists) {
          const linked = yield* isSymlink(originalPath);
          if (linked) {
            placementPath = yield* fileSystem
              .realPath(originalPath)
              .pipe(Effect.mapError(asIo("Could not resolve skill symlink")));
            const displacedMeta = yield* backups.create({
              instanceId: meta.instanceId,
              name: meta.name,
              reason: "update",
              originalPath,
              source: placementPath,
              move: false,
            });
            displaced = toSkillBackup(displacedMeta);
            yield* fileSystem
              .remove(placementPath, { recursive: true, force: true })
              .pipe(Effect.mapError(asIo("Could not clear linked skill directory")));
          } else {
            const displacedMeta = yield* backups.create({
              instanceId: meta.instanceId,
              name: meta.name,
              reason: "update",
              originalPath,
              source: originalPath,
              move: true,
            });
            displaced = toSkillBackup(displacedMeta);
          }
        } else {
          yield* fileSystem
            .makeDirectory(path.dirname(originalPath), { recursive: true })
            .pipe(Effect.mapError(asIo("Could not create parent directory")));
        }

        yield* renameOrCopy(sourcePath, placementPath);
        yield* backups.remove(meta.id);
        yield* refreshSnapshotsForDirectory(skillsDirectory);

        const info = yield* folderInfoForList(placementPath);
        const install: SkillInstall = {
          name: meta.name,
          source: "personal",
          path: path.join(originalPath, "SKILL.md"),
          hash: info.hash,
          fileCount: info.fileCount,
          bytes: info.bytes,
          modifiedAt: info.modifiedAt,
          symlinked: yield* isSymlink(originalPath),
        };
        return { install, backup: displaced };
      }),
    );
  });

  return { list, read, write, remove, restore };
});
