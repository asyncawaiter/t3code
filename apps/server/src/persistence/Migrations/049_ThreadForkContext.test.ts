import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("049_ThreadForkContext", (it) => {
  it.effect("creates the thread_fork_context table", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 48 });
      yield* runMigrations({ toMigrationInclusive: 49 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(thread_fork_context)
      `;
      const byName = new Map(columns.map((column) => [column.name, column]));

      // thread_id is the (non-INTEGER) PRIMARY KEY: SQLite enforces it can't
      // be NULL, but PRAGMA table_info only reports notnull=1 for an
      // explicit NOT NULL constraint, which a plain TEXT PRIMARY KEY doesn't
      // have.
      assert.equal(byName.get("thread_id")?.name, "thread_id");
      assert.equal(byName.get("source_thread_id")?.notnull, 1);
      assert.equal(byName.get("source_message_id")?.notnull, 1);
      assert.equal(byName.get("source_sequence")?.notnull, 1);
      assert.equal(byName.get("entries_json")?.notnull, 1);
      assert.equal(byName.get("captured_chars")?.notnull, 1);
      assert.equal(byName.get("consumed_at")?.notnull, 0);
      assert.equal(byName.get("created_at")?.notnull, 1);
    }),
  );
});
