import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS thread_fork_context (
      thread_id TEXT PRIMARY KEY,
      source_thread_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      source_sequence INTEGER NOT NULL,
      entries_json TEXT NOT NULL,
      captured_chars INTEGER NOT NULL,
      consumed_at TEXT NULL,
      created_at TEXT NOT NULL
    )
  `;
});
