import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/**
 * Where an installed skill comes from, relative to one provider instance:
 *  - `personal`: lives in this instance's own skills directory, so T3 can update or remove it.
 *  - `shared`: user-level but owned elsewhere (e.g. Cursor reading `~/.claude/skills`).
 *  - `project`: checked into a repository; travels with git and never counts as a gap.
 *  - `builtin`: shipped by the provider or a plugin; read only.
 */
export const SkillSource = Schema.Literals(["personal", "shared", "project", "builtin"]);
export type SkillSource = typeof SkillSource.Type;

export const SkillInstall = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  source: SkillSource,
  /** Absolute path of the skill's `SKILL.md` (or the provider-reported path). */
  path: TrimmedNonEmptyString,
  /** SHA-256 over the skill folder's relative paths and contents. Null when the folder can't be read. */
  hash: Schema.NullOr(TrimmedNonEmptyString),
  fileCount: NonNegativeInt,
  bytes: NonNegativeInt,
  modifiedAt: Schema.NullOr(IsoDateTime),
  /** The skill folder is a symlink (commonly into a dotfiles repo); writes go through it. */
  symlinked: Schema.Boolean,
});
export type SkillInstall = typeof SkillInstall.Type;

export const SkillProviderInventory = Schema.Struct({
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  displayName: Schema.optional(TrimmedNonEmptyString),
  enabled: Schema.Boolean,
  /** Personal skills directory T3 installs into. Null when the provider can't take file-based skills. */
  skillsDirectory: Schema.NullOr(TrimmedNonEmptyString),
  skills: Schema.Array(SkillInstall),
});
export type SkillProviderInventory = typeof SkillProviderInventory.Type;

export const SkillBackup = Schema.Struct({
  id: TrimmedNonEmptyString,
  instanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
  reason: Schema.Literals(["update", "remove"]),
  createdAt: IsoDateTime,
});
export type SkillBackup = typeof SkillBackup.Type;

export const SkillInventory = Schema.Struct({
  checkedAt: IsoDateTime,
  providers: Schema.Array(SkillProviderInventory),
  /** Recent backups, newest first, so removals and updates can be undone. */
  backups: Schema.Array(SkillBackup),
});
export type SkillInventory = typeof SkillInventory.Type;

export const SkillFile = Schema.Struct({
  /** Path relative to the skill folder, `/`-separated. */
  path: TrimmedNonEmptyString,
  encoding: Schema.Literals(["utf8", "base64"]),
  content: Schema.String,
});
export type SkillFile = typeof SkillFile.Type;

export const SkillBundle = Schema.Struct({
  name: TrimmedNonEmptyString,
  hash: TrimmedNonEmptyString,
  files: Schema.Array(SkillFile),
});
export type SkillBundle = typeof SkillBundle.Type;

export const SkillListInput = Schema.Struct({});
export type SkillListInput = typeof SkillListInput.Type;

export const SkillReadInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
});
export type SkillReadInput = typeof SkillReadInput.Type;

export const SkillWriteInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
  files: Schema.Array(SkillFile),
  /** Hash of the personal copy being replaced, or null when the skill must not exist yet. */
  expectedHash: Schema.NullOr(TrimmedNonEmptyString),
});
export type SkillWriteInput = typeof SkillWriteInput.Type;

export const SkillWriteResult = Schema.Struct({
  install: SkillInstall,
  backup: Schema.NullOr(SkillBackup),
});
export type SkillWriteResult = typeof SkillWriteResult.Type;

export const SkillRemoveInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
  expectedHash: TrimmedNonEmptyString,
});
export type SkillRemoveInput = typeof SkillRemoveInput.Type;

export const SkillRemoveResult = Schema.Struct({ backup: SkillBackup });
export type SkillRemoveResult = typeof SkillRemoveResult.Type;

export const SkillRestoreInput = Schema.Struct({ backupId: TrimmedNonEmptyString });
export type SkillRestoreInput = typeof SkillRestoreInput.Type;

export class SkillLibraryError extends Schema.TaggedError<SkillLibraryError>()(
  "SkillLibraryError",
  {
    reason: Schema.Literals(["not-found", "conflict", "invalid", "unsupported", "too-large", "io"]),
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}
