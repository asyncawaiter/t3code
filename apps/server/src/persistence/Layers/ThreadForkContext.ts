import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteThreadForkContextBySourceThreadIdInput,
  DeleteThreadForkContextInput,
  GetThreadForkContextInput,
  ThreadForkContext,
  ThreadForkContextEntry,
  ThreadForkContextRepository,
  type ThreadForkContextRepositoryShape,
} from "../Services/ThreadForkContext.ts";

const ThreadForkContextDbRowSchema = ThreadForkContext.mapFields(
  Struct.assign({
    entries: Schema.fromJsonString(Schema.Array(ThreadForkContextEntry)),
  }),
);

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeThreadForkContextRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertThreadForkContextRow = SqlSchema.void({
    Request: ThreadForkContextDbRowSchema,
    execute: (row) =>
      sql`
        INSERT INTO thread_fork_context (
          thread_id,
          source_thread_id,
          source_message_id,
          source_sequence,
          entries_json,
          captured_chars,
          consumed_at,
          created_at
        )
        VALUES (
          ${row.threadId},
          ${row.sourceThreadId},
          ${row.sourceMessageId},
          ${row.sourceSequence},
          ${row.entries},
          ${row.capturedChars},
          ${row.consumedAt},
          ${row.createdAt}
        )
        ON CONFLICT (thread_id) DO NOTHING
      `,
  });

  const getThreadForkContextRow = SqlSchema.findOneOption({
    Request: GetThreadForkContextInput,
    Result: ThreadForkContextDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          source_thread_id AS "sourceThreadId",
          source_message_id AS "sourceMessageId",
          source_sequence AS "sourceSequence",
          entries_json AS "entries",
          captured_chars AS "capturedChars",
          consumed_at AS "consumedAt",
          created_at AS "createdAt"
        FROM thread_fork_context
        WHERE thread_id = ${threadId}
      `,
  });

  const deleteThreadForkContextRow = SqlSchema.void({
    Request: DeleteThreadForkContextInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM thread_fork_context
        WHERE thread_id = ${threadId}
      `,
  });

  const deleteThreadForkContextRowsBySourceThreadId = SqlSchema.void({
    Request: DeleteThreadForkContextBySourceThreadIdInput,
    execute: ({ sourceThreadId }) =>
      sql`
        DELETE FROM thread_fork_context
        WHERE source_thread_id = ${sourceThreadId}
      `,
  });

  const upsert: ThreadForkContextRepositoryShape["upsert"] = (row) =>
    upsertThreadForkContextRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadForkContextRepository.upsert:query",
          "ThreadForkContextRepository.upsert:encodeRequest",
        ),
      ),
    );

  const get: ThreadForkContextRepositoryShape["get"] = (input) =>
    getThreadForkContextRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadForkContextRepository.get:query",
          "ThreadForkContextRepository.get:decodeRow",
        ),
      ),
      Effect.map((rowOption) =>
        Option.map(rowOption, (row) => row as Schema.Schema.Type<typeof ThreadForkContext>),
      ),
    );

  const deleteRow: ThreadForkContextRepositoryShape["delete"] = (input) =>
    deleteThreadForkContextRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ThreadForkContextRepository.delete:query")),
    );

  const deleteBySourceThreadId: ThreadForkContextRepositoryShape["deleteBySourceThreadId"] = (
    input,
  ) =>
    deleteThreadForkContextRowsBySourceThreadId(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ThreadForkContextRepository.deleteBySourceThreadId:query"),
      ),
    );

  return {
    upsert,
    get,
    delete: deleteRow,
    deleteBySourceThreadId,
  } satisfies ThreadForkContextRepositoryShape;
});

export const ThreadForkContextRepositoryLive = Layer.effect(
  ThreadForkContextRepository,
  makeThreadForkContextRepository,
);
