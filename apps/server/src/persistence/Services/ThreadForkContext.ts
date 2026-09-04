/**
 * ThreadForkContextRepository - Persistence for the curated transcript captured
 * when a chat is forked into a new tab.
 *
 * A row holds the portable text entries a "Fork in a new tab" action curated
 * from the source thread at fork time. The child thread's first successful
 * turn reads the row to prepend that context to the provider input, then
 * deletes it so later turns never resend it. A failed send leaves the row in
 * place for the retry to pick up; deletion is not exactly-once (a crash
 * between a successful sendTurn and the delete could resend on retry).
 *
 * @module ThreadForkContextRepository
 */
import { IsoDateTime, MessageId, NonNegativeInt, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ThreadForkContextEntry = Schema.Struct({
  kind: Schema.Literals(["user", "assistant", "tool", "plan"]),
  text: Schema.String,
  partial: Schema.optional(Schema.Boolean),
});
export type ThreadForkContextEntry = typeof ThreadForkContextEntry.Type;

export const ThreadForkContext = Schema.Struct({
  threadId: ThreadId,
  sourceThreadId: ThreadId,
  sourceMessageId: MessageId,
  sourceSequence: NonNegativeInt,
  entries: Schema.Array(ThreadForkContextEntry),
  capturedChars: NonNegativeInt,
  consumedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
});
export type ThreadForkContext = typeof ThreadForkContext.Type;

export const GetThreadForkContextInput = Schema.Struct({
  threadId: ThreadId,
});
export type GetThreadForkContextInput = typeof GetThreadForkContextInput.Type;

export const DeleteThreadForkContextInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteThreadForkContextInput = typeof DeleteThreadForkContextInput.Type;

export const DeleteThreadForkContextBySourceThreadIdInput = Schema.Struct({
  sourceThreadId: ThreadId,
});
export type DeleteThreadForkContextBySourceThreadIdInput =
  typeof DeleteThreadForkContextBySourceThreadIdInput.Type;

/**
 * ThreadForkContextRepositoryShape - Service API for fork context rows.
 */
export interface ThreadForkContextRepositoryShape {
  /**
   * Insert a fork context row, keyed by `threadId` (the child thread).
   *
   * A no-op when a row already exists for that thread id: `threadId` is a
   * client-minted id unique per fork attempt, so an existing row only means
   * a duplicate/retried RPC, and it must not overwrite context a prior
   * attempt already stored (and possibly already consumed).
   */
  readonly upsert: (row: ThreadForkContext) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Read the fork context row for a thread, if one is still present. The row
   * is deleted once its context has been sent (see `delete`), so presence
   * alone means "not yet sent".
   */
  readonly get: (
    input: GetThreadForkContextInput,
  ) => Effect.Effect<Option.Option<ThreadForkContext>, ProjectionRepositoryError>;

  /**
   * Delete the fork context row for a thread.
   */
  readonly delete: (
    input: DeleteThreadForkContextInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Delete every fork context row captured from a given source thread. Used
   * when the source thread itself is deleted: its forked children's context
   * rows still name it as `sourceThreadId` and would otherwise reference a
   * dangling thread.
   */
  readonly deleteBySourceThreadId: (
    input: DeleteThreadForkContextBySourceThreadIdInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

/**
 * ThreadForkContextRepository - Service tag for fork context persistence.
 */
export class ThreadForkContextRepository extends Context.Service<
  ThreadForkContextRepository,
  ThreadForkContextRepositoryShape
>()("t3/persistence/Services/ThreadForkContext/ThreadForkContextRepository") {}
