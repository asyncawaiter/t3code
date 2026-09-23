import { ChatAttachment, PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "./orchestration.ts";
import * as Schema from "effect/Schema";
import * as Equal from "effect/Equal";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { EnvironmentId, ThreadId, ProjectId, MessageId } from "./baseSchemas.ts";

export const TaskDraftRef = Schema.Struct({
  environmentId: EnvironmentId,
  taskId: TrimmedNonEmptyString,
});
export type TaskDraftRef = typeof TaskDraftRef.Type;

export const WorkItemHandoff = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  messageId: MessageId,
  createdAt: IsoDateTime,
  sentAt: Schema.optionalKey(IsoDateTime),
  resultMessageId: Schema.optionalKey(MessageId),
  cancelledAt: Schema.optionalKey(IsoDateTime),
});
export type WorkItemHandoff = typeof WorkItemHandoff.Type;

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
  executionEnvironmentId: Schema.optionalKey(Schema.NullOr(EnvironmentId)),
  deletedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  remindAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  priority: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
  chats: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        environmentId: EnvironmentId,
        threadId: ThreadId,
        purpose: Schema.String.check(Schema.isMaxLength(240)),
        result: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4000))),
      }),
    ).check(Schema.isMaxLength(50)),
  ),
  handoffs: Schema.optionalKey(Schema.Array(WorkItemHandoff).check(Schema.isMaxLength(100))),
  completedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  preparationThreadId: Schema.optionalKey(Schema.NullOr(ThreadId)),
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
    if (!next) throw new Error("Move tasks to Trash instead of erasing their context.");
    if (existing?.deletedAt && !previous?.deletedAt)
      throw new Error("This task is in Trash. Reopen it before restoring.");
    if (existing?.chats && previous?.chats === undefined)
      throw new Error("Update this client before editing tasks with multiple chats.");
    if (existing?.handoffs && previous?.handoffs === undefined)
      throw new Error("Update this client before editing tasks with handoff history.");
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

export function workItemChats(item: WorkItem, storageEnvironmentId: EnvironmentId) {
  const chats = [...(item.chats ?? [])];
  const environmentId = item.executionEnvironmentId ?? storageEnvironmentId;
  if (
    item.threadId &&
    !chats.some((chat) => chat.environmentId === environmentId && chat.threadId === item.threadId)
  )
    chats.unshift({ environmentId, threadId: item.threadId, purpose: "Work" });
  return chats;
}

export function workItemPreparationThread(item: WorkItem) {
  return item.preparationThreadId !== undefined
    ? item.preparationThreadId
    : (item.source?.threadId ?? item.threadId);
}

export function workItemTitle(notes: string, attachmentCount = 0) {
  return (
    notes
      .trim()
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 240) || (attachmentCount ? "Screenshot or file to review" : "Untitled task")
  );
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

/** A linked chat is only a destination. Only an accepted handoff moves work out of Planned. */
export function workItemStage(item: WorkItem) {
  return item.status === "done" ? "Completed" : item.status === "working" ? "In chat" : "Planned";
}

export function recordWorkItemHandoff(item: WorkItem, handoff: WorkItemHandoff): WorkItem {
  if (item.deletedAt || item.status === "done")
    throw new Error("Reopen this task before sending it.");
  if (
    item.handoffs?.some(
      (entry) =>
        entry.messageId === handoff.messageId && entry.environmentId === handoff.environmentId,
    )
  )
    return item;
  if ((item.handoffs?.length ?? 0) >= 100)
    throw new Error("This task has reached its handoff history limit.");
  return {
    ...item,
    chats: item.chats?.some(
      (chat) => chat.environmentId === handoff.environmentId && chat.threadId === handoff.threadId,
    )
      ? item.chats
      : [
          ...(item.chats ?? []),
          { environmentId: handoff.environmentId, threadId: handoff.threadId, purpose: "Work" },
        ],
    handoffs: [...(item.handoffs ?? []), handoff],
    updatedAt: item.updatedAt > handoff.createdAt ? item.updatedAt : handoff.createdAt,
  };
}

export function confirmWorkItemHandoff(
  item: WorkItem,
  handoff: WorkItemHandoff,
  sentAt: string,
): WorkItem {
  const current = item.handoffs?.find(
    (entry) =>
      entry.messageId === handoff.messageId && entry.environmentId === handoff.environmentId,
  );
  if (item.deletedAt || !current || current.sentAt || current.cancelledAt) return item;
  return {
    ...item,
    status: item.status === "done" ? "done" : "working",
    remindAt: null,
    handoffs: (item.handoffs ?? []).map((entry) =>
      entry.messageId === handoff.messageId && entry.environmentId === handoff.environmentId
        ? { ...entry, sentAt }
        : entry,
    ),
    updatedAt: item.updatedAt > sentAt ? item.updatedAt : sentAt,
  };
}

export function returnWorkItemToPlanned(item: WorkItem, now: string): WorkItem {
  return {
    ...item,
    status: "parked",
    completedAt: null,
    preparation: null,
    handoffs: (item.handoffs ?? []).map((entry) =>
      entry.sentAt ? entry : { ...entry, cancelledAt: now },
    ),
    updatedAt: now,
  };
}
