import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import { ServerConfig } from "../../config.ts";
import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";

import {
  CodexResetCreditCoordinator,
  layerTest,
  make,
  confirmResetCreditOutcome,
} from "./codexResetCredit.ts";

describe("CodexResetCreditCoordinator", () => {
  it.effect("re-sends the same idempotency key after a failed attempt, then clears it", () =>
    Effect.gen(function* () {
      const { redeem } = yield* CodexResetCreditCoordinator;
      const keys = yield* Ref.make<ReadonlyArray<string>>([]);
      const attempts = yield* Ref.make(0);
      const consume = (key: string) =>
        Effect.gen(function* () {
          yield* Ref.update(keys, (seen) => [...seen, key]);
          const attempt = yield* Ref.updateAndGet(attempts, (n) => n + 1);
          if (attempt === 1) return yield* Effect.fail("timed out" as const);
          return "reset" as const;
        });

      const first = yield* redeem("acct", consume).pipe(Effect.result);
      assert.isTrue(first._tag === "Failure");
      const second = yield* redeem("acct", consume);
      assert.strictEqual(second, "reset");
      // A fresh redemption after success must be a fresh attempt.
      yield* redeem("acct", consume);

      const seen = yield* Ref.get(keys);
      assert.strictEqual(seen.length, 3);
      assert.strictEqual(seen[0], seen[1]);
      assert.notStrictEqual(seen[1], seen[2]);
    }).pipe(Effect.provide(layerTest)),
  );

  it.effect("serialises concurrent redemptions on the same account, not per caller", () =>
    Effect.gen(function* () {
      const { redeem } = yield* CodexResetCreditCoordinator;
      const release = yield* Deferred.make<void>();
      const inFlight = yield* Ref.make(0);
      const peak = yield* Ref.make(0);
      const consume = () =>
        Effect.gen(function* () {
          const now = yield* Ref.updateAndGet(inFlight, (n) => n + 1);
          yield* Ref.update(peak, (p) => Math.max(p, now));
          yield* Deferred.await(release);
          yield* Ref.update(inFlight, (n) => n - 1);
          return "reset" as const;
        });

      // Two instances of the same account redeem at once.
      const a = yield* redeem("acct", consume).pipe(Effect.forkChild);
      const b = yield* redeem("acct", consume).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(a);
      yield* Fiber.join(b);

      assert.strictEqual(yield* Ref.get(peak), 1);
    }).pipe(Effect.provide(layerTest)),
  );

  it.effect("keeps different accounts independent", () =>
    Effect.gen(function* () {
      const { redeem } = yield* CodexResetCreditCoordinator;
      const release = yield* Deferred.make<void>();
      const peak = yield* Ref.make(0);
      const inFlight = yield* Ref.make(0);
      const consume = () =>
        Effect.gen(function* () {
          const now = yield* Ref.updateAndGet(inFlight, (n) => n + 1);
          yield* Ref.update(peak, (p) => Math.max(p, now));
          yield* Deferred.await(release);
          return "reset" as const;
        });
      const a = yield* redeem("acct-a", consume).pipe(Effect.forkChild);
      const b = yield* redeem("acct-b", consume).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(a);
      yield* Fiber.join(b);
      assert.strictEqual(yield* Ref.get(peak), 2);
    }).pipe(Effect.provide(layerTest)),
  );
});

it.effect("keeps each provider outcome when balance refresh fails", () =>
  Effect.gen(function* () {
    for (const outcome of ["reset", "nothingToReset", "noCredit", "alreadyRedeemed"] as const) {
      const failed = yield* confirmResetCreditOutcome(outcome, Effect.fail("offline"));
      assert.strictEqual(failed.outcome, outcome);
      assert.isString(failed.warning);
      assert.deepStrictEqual(yield* confirmResetCreditOutcome(outcome, Effect.succeed(true)), {
        outcome,
      });
    }
  }),
);

it.effect("reuses an uncertain attempt after service restart, then starts a fresh attempt", () =>
  Effect.gen(function* () {
    const before = yield* make;
    let firstKey = "";
    yield* before
      .redeem("account", (key) => {
        firstKey = key;
        return Effect.fail("response lost");
      })
      .pipe(Effect.result);
    const restarted = yield* make;
    let retriedKey = "";
    assert.strictEqual(
      yield* restarted.redeem("account", (key) => {
        retriedKey = key;
        return Effect.succeed("alreadyRedeemed" as const);
      }),
      "alreadyRedeemed",
    );
    assert.strictEqual(retriedKey, firstKey);
    yield* restarted.redeem("account", (key) => {
      assert.notStrictEqual(key, firstKey);
      return Effect.succeed("noCredit" as const);
    });
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-reset-restart-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);

it.effect("does not consume a credit when the attempt cannot be persisted", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig;
    yield* fs.writeFileString(config.stateDir + "/reset-attempts", "not a directory");
    const coordinator = yield* make;
    let consumed = false;
    const result = yield* coordinator
      .redeem("account", () => {
        consumed = true;
        return Effect.succeed("reset" as const);
      })
      .pipe(Effect.result);
    assert.strictEqual(result._tag, "Failure");
    assert.isFalse(consumed);
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-reset-write-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);
