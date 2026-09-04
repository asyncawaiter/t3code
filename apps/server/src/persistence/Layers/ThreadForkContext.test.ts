import { MessageId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { ThreadForkContextRepositoryLive } from "./ThreadForkContext.ts";
import { ThreadForkContextRepository } from "../Services/ThreadForkContext.ts";

const layer = it.layer(
  Layer.mergeAll(
    ThreadForkContextRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

layer("ThreadForkContextRepository", (it) => {
  it.effect("upsert then get round-trips the curated entries", () =>
    Effect.gen(function* () {
      const repo = yield* ThreadForkContextRepository;

      yield* repo.upsert({
        threadId: ThreadId.make("thread-child"),
        sourceThreadId: ThreadId.make("thread-source"),
        sourceMessageId: MessageId.make("msg-1"),
        sourceSequence: 4,
        entries: [
          { kind: "user", text: "hello" },
          { kind: "assistant", text: "hi there", partial: true },
        ],
        capturedChars: 13,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const row = yield* repo.get({ threadId: ThreadId.make("thread-child") });
      assert.ok(Option.isSome(row));
      assert.strictEqual(Option.getOrThrow(row).sourceThreadId, "thread-source");
      assert.deepStrictEqual(Option.getOrThrow(row).entries, [
        { kind: "user", text: "hello" },
        { kind: "assistant", text: "hi there", partial: true },
      ]);
    }),
  );

  it.effect("upsert is a no-op when a row already exists for the thread id", () =>
    Effect.gen(function* () {
      const repo = yield* ThreadForkContextRepository;

      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-4"),
        sourceThreadId: ThreadId.make("thread-source"),
        sourceMessageId: MessageId.make("msg-1"),
        sourceSequence: 1,
        entries: [{ kind: "user", text: "first attempt" }],
        capturedChars: 13,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // A retried RPC dispatching the same idempotent commandId would call
      // upsert again with (possibly different, re-curated) entries. That
      // must not clobber the row a prior attempt already stored.
      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-4"),
        sourceThreadId: ThreadId.make("thread-source"),
        sourceMessageId: MessageId.make("msg-2"),
        sourceSequence: 2,
        entries: [{ kind: "user", text: "second attempt" }],
        capturedChars: 14,
        consumedAt: null,
        createdAt: "2026-01-01T00:01:00.000Z",
      });

      const row = yield* repo.get({ threadId: ThreadId.make("thread-child-4") });
      assert.ok(Option.isSome(row));
      assert.strictEqual(Option.getOrThrow(row).sourceMessageId, "msg-1");
      assert.deepStrictEqual(Option.getOrThrow(row).entries, [
        { kind: "user", text: "first attempt" },
      ]);
    }),
  );

  it.effect("delete removes the row entirely", () =>
    Effect.gen(function* () {
      const repo = yield* ThreadForkContextRepository;

      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-3"),
        sourceThreadId: ThreadId.make("thread-source"),
        sourceMessageId: MessageId.make("msg-1"),
        sourceSequence: 1,
        entries: [{ kind: "user", text: "hello" }],
        capturedChars: 5,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      yield* repo.delete({ threadId: ThreadId.make("thread-child-3") });

      const row = yield* repo.get({ threadId: ThreadId.make("thread-child-3") });
      assert.ok(Option.isNone(row));
    }),
  );

  it.effect("deleteBySourceThreadId removes every row captured from that source thread", () =>
    Effect.gen(function* () {
      const repo = yield* ThreadForkContextRepository;

      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-5"),
        sourceThreadId: ThreadId.make("thread-source-5"),
        sourceMessageId: MessageId.make("msg-1"),
        sourceSequence: 1,
        entries: [{ kind: "user", text: "hello" }],
        capturedChars: 5,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-6"),
        sourceThreadId: ThreadId.make("thread-source-5"),
        sourceMessageId: MessageId.make("msg-2"),
        sourceSequence: 2,
        entries: [{ kind: "user", text: "hi" }],
        capturedChars: 2,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      // A row from an unrelated source thread must survive.
      yield* repo.upsert({
        threadId: ThreadId.make("thread-child-7"),
        sourceThreadId: ThreadId.make("thread-source-unrelated"),
        sourceMessageId: MessageId.make("msg-3"),
        sourceSequence: 1,
        entries: [{ kind: "user", text: "unrelated" }],
        capturedChars: 9,
        consumedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      yield* repo.deleteBySourceThreadId({ sourceThreadId: ThreadId.make("thread-source-5") });

      const rowChild5 = yield* repo.get({ threadId: ThreadId.make("thread-child-5") });
      const rowChild6 = yield* repo.get({ threadId: ThreadId.make("thread-child-6") });
      const rowChild7 = yield* repo.get({ threadId: ThreadId.make("thread-child-7") });
      assert.ok(Option.isNone(rowChild5));
      assert.ok(Option.isNone(rowChild6));
      assert.ok(Option.isSome(rowChild7));
    }),
  );
});
