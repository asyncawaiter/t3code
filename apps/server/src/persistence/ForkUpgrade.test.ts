import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "./Migrations.ts";

it.layer(NodeSqliteClient.layerMemory())("nightly upgrade from fork migrations", (it) => {
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
