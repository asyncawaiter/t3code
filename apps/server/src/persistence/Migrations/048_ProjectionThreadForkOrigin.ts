import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("fork_source_thread_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_thread_id TEXT
    `;
  }
  if (!columnNames.has("fork_source_message_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_message_id TEXT
    `;
  }
  if (!columnNames.has("fork_source_turn_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_turn_id TEXT
    `;
  }
  if (!columnNames.has("fork_source_sequence")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_source_sequence INTEGER
    `;
  }
  if (!columnNames.has("fork_forked_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_forked_at TEXT
    `;
  }
});
