import { ChatAttachment, PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "./orchestration.ts";
import * as Schema from "effect/Schema";
import * as Equal from "effect/Equal";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { EnvironmentId, ThreadId, ProjectId } from "./baseSchemas.ts";

export const WorkItem = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(240)),
  notes: Schema.String.check(Schema.isMaxLength(32000)),
  brief: Schema.String.check(Schema.isMaxLength(32000)),
  status: Schema.Literals(["parked", "ready", "working", "done"]),
  profileId: Schema.NullOr(Schema.String),
  spaceId: Schema.NullOr(Schema.String),
  projectId: Schema.NullOr(ProjectId),
  source: Schema.NullOr(
    Schema.Struct({
      environmentId: EnvironmentId,
      threadId: ThreadId,
      messageId: Schema.optional(Schema.String),
    }),
  ),
  threadId: Schema.NullOr(ThreadId),
  preparation: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        requestedAt: IsoDateTime,
        state: Schema.Literals(["queued", "running", "failed"]),
        error: Schema.optional(Schema.String),
      }),
    ),
  ),
  attachments: Schema.optionalKey(
    Schema.Array(ChatAttachment).check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS)),
  ),
  links: Schema.Array(Schema.String.check(Schema.isMaxLength(2048))).check(Schema.isMaxLength(30)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkItem = typeof WorkItem.Type;
export const WorkItems = Schema.Array(WorkItem).check(Schema.isMaxLength(1000));

/** Merge independent task edits, refusing to overwrite a concurrent edit to the same task. */
export function mergeWorkItems(
  current: readonly WorkItem[],
  base: readonly WorkItem[],
  edited: readonly WorkItem[],
) {
  const before = new Map(base.map((item) => [item.id, item]));
  const after = new Map(edited.map((item) => [item.id, item]));
  if (after.size !== edited.length) throw new Error("Task IDs must be unique.");
  const live = new Map(current.map((item) => [item.id, item]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id),
      next = after.get(id),
      existing = live.get(id);
    if (Equal.equals(previous, next) || Equal.equals(existing, next)) continue;
    if (!Equal.equals(existing, previous))
      throw new Error("This task changed on another device. Reopen it before saving.");
    if (!next) throw new Error("Complete tasks instead of deleting their context.");
    live.set(id, next);
  }
  const result = [...live.values()];
  if (result.length > 1000) throw new Error("This device has reached its 1,000-task limit.");
  // ponytail: bounded settings-backed task storage; move to paged records if this ceiling is reached.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 2_000_000)
    throw new Error(
      "Saved task context has reached this device's 2 MB limit. Shorten older notes or briefs before saving.",
    );
  return result;
}

export function workItemPrompt(item: WorkItem) {
  return [
    `Task: ${item.title}`,
    item.brief || item.notes,
    item.brief && item.notes ? `Original request:\n${item.notes}` : "",
    item.links.length ? `Sources:\n${item.links.join("\n")}` : "",
    item.source
      ? `Source chat: ${item.source.environmentId}/${item.source.threadId}${item.source.messageId ? ` at message ${item.source.messageId}` : ""}. The source may have changed since capture; verify relevant files before editing.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
