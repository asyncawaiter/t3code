import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("048_ProjectionThreadForkOrigin", (it) => {
  it.effect("adds the nullable fork origin columns to thread projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 47 });
      yield* runMigrations({ toMigrationInclusive: 48 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      const byName = new Map(columns.map((column) => [column.name, column]));

      for (const name of [
        "fork_source_thread_id",
        "fork_source_message_id",
        "fork_source_turn_id",
        "fork_source_sequence",
        "fork_forked_at",
      ]) {
        const column = byName.get(name);
        assert.equal(column?.name, name);
        assert.equal(column?.notnull, 0);
      }
    }),
  );
});
