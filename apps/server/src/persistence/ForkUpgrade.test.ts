import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("nightly upgrade from fork migrations", (it) => {
  it.effect("preserves fork origins and unsent context while adding nightly columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 49 });
      const now = "2026-09-07T00:00:00.000Z";
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          created_at, updated_at, fork_source_thread_id, fork_source_message_id,
          fork_source_sequence, fork_forked_at
        ) VALUES (
          'child', 'project', 'Forked chat', '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access', ${now}, ${now}, 'source', 'message', 12, ${now}
        )
      `;
      yield* sql`
        INSERT INTO thread_fork_context (
          thread_id, source_thread_id, source_message_id, source_sequence,
          entries_json, captured_chars, created_at
        ) VALUES ('child', 'source', 'message', 12, '[]', 0, ${now})
      `;
      yield* runMigrations();
      yield* runMigrations();
      const threads = yield* sql`
        SELECT fork_source_thread_id, fork_source_message_id, fork_source_sequence,
          branch_pull_request_json, active_order_key
        FROM projection_threads WHERE thread_id = 'child'
      `;
      assert.deepEqual(threads, [{
        fork_source_thread_id: "source", fork_source_message_id: "message",
        fork_source_sequence: 12, branch_pull_request_json: null, active_order_key: null,
      }]);
      const context = yield* sql`
        SELECT source_sequence, entries_json, consumed_at FROM thread_fork_context WHERE thread_id = 'child'
      `;
      assert.deepEqual(context, [{ source_sequence: 12, entries_json: "[]", consumed_at: null }]);
    }),
  );
});

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("September 20 fork upgrade", (it) => {
  it.effect("preserves the shipped schema and data while appending all four nightly migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 51 });
      const now = "2026-09-19T12:00:00.000Z";
      const linked = JSON.stringify({ repository: "owner/repo", number: 7, url: "https://github.com/owner/repo/pull/7" });
      const attachments = JSON.stringify([{ id: "screenshot", name: "context.png" }]);
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          created_at, updated_at, fork_source_thread_id, fork_source_message_id,
          fork_source_sequence, fork_forked_at, active_order_key, settled_at,
          linked_pull_request_json
        ) VALUES (
          'retained', 'project', 'Existing fork', '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access', ${now}, ${now}, 'source', 'message', 3, ${now}, 'gm', ${now}, ${linked}
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id, thread_id, role, text, is_streaming, created_at, updated_at, attachments_json
        ) VALUES ('prompt', 'retained', 'user', 'Keep this context', 0, ${now}, ${now}, ${attachments})
      `;
      yield* sql`
        INSERT INTO thread_fork_context (
          thread_id, source_thread_id, source_message_id, source_sequence,
          entries_json, captured_chars, created_at
        ) VALUES ('retained', 'source', 'message', 3, '[]', 0, ${now})
      `;
      const before = yield* sql`SELECT * FROM projection_threads WHERE thread_id = 'retained'`;
      const executed = yield* runMigrations();
      assert.deepEqual(executed, migrationManifest.filter(([id]) => id > 51));
      assert.deepEqual(executed.map(([id]) => id), [52, 53, 54, 55]);
      assert.deepEqual(yield* runMigrations(), []);
      const after = yield* sql`SELECT projection_threads.* FROM projection_threads WHERE thread_id = 'retained'`;
      assert.deepEqual(after, before.map((row) => ({ ...row, title_state_json: null })));
      assert.deepEqual(
        yield* sql`SELECT text, attachments_json, context_json FROM projection_thread_messages WHERE message_id = 'prompt'`,
        [{ text: "Keep this context", attachments_json: attachments, context_json: null }],
      );
      assert.deepEqual(
        yield* sql`SELECT source_thread_id, source_sequence, consumed_at FROM thread_fork_context WHERE thread_id = 'retained'`,
        [{ source_thread_id: "source", source_sequence: 3, consumed_at: null }],
      );
      assert.deepEqual(
        yield* sql`SELECT thread_id, repository, number, source FROM projection_thread_pull_requests`,
        [{ thread_id: "retained", repository: "owner/repo", number: 7, source: "manual" }],
      );
      assert.deepEqual(yield* sql`SELECT * FROM pull_request_files_viewed`, []);
      assert.deepEqual(
        yield* sql`SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 48 ORDER BY migration_id`,
        migrationManifest.filter(([id]) => id >= 48).map(([migration_id, name]) => ({ migration_id, name })),
      );
    }),
  );
});
