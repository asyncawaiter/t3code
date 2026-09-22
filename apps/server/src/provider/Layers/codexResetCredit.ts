/**
 * Redeeming a Codex reset credit is an account-level action: instances that
 * share the directory holding `auth.json` share the credit, so their
 * redemptions must serialise on that directory, not the instance. This
 * service keeps one lock and one pending idempotency key per account key so
 * overlapping confirmations from any instance queue, and a retry after a
 * timeout or server restart re-sends the persisted attempt.
 *
 * @module provider/Layers/codexResetCredit
 */
import type {
  ProviderConsumeResetCreditOutcome,
  ProviderConsumeResetCreditResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ServerConfig } from "../../config.ts";
import { writeFileStringAtomically } from "../../atomicWrite.ts";
import type * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

/**
 * Bounded so a hung app-server cannot hold the account lock forever; the
 * timeout interrupts the scoped request, which kills the process, and the
 * kept idempotency key makes the user's retry safe.
 */
export const CODEX_RESET_CREDIT_TIMEOUT = Duration.seconds(20);

interface AccountRedemptionState {
  readonly lock: Semaphore.Semaphore;
}

export class CodexResetCreditCoordinator extends Context.Service<
  CodexResetCreditCoordinator,
  {
    /**
     * Run `consume` under the account's lock with a stable idempotency key.
     * The key is cleared only when Codex reports an outcome; a failure
     * (timeout included) keeps it so the next attempt is the same attempt.
     */
    readonly redeem: <E, R>(
      accountKey: string,
      consume: (idempotencyKey: string) => Effect.Effect<ProviderConsumeResetCreditOutcome, E, R>,
    ) => Effect.Effect<ProviderConsumeResetCreditOutcome, E | PlatformError.PlatformError, R>;
  }
>()("t3/provider/Layers/codexResetCredit/CodexResetCreditCoordinator") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const statesRef = yield* Ref.make<ReadonlyMap<string, AccountRedemptionState>>(new Map());

  // Get-or-create through one Ref.modify so two first redemptions for the
  // same account cannot each install their own lock.
  const stateFor = Effect.fn("CodexResetCreditCoordinator.stateFor")(function* (
    accountKey: string,
  ) {
    const existing = (yield* Ref.get(statesRef)).get(accountKey);
    if (existing) return existing;
    const candidate = {
      lock: yield* Semaphore.make(1),
    };
    return yield* Ref.modify(statesRef, (states) => {
      const current = states.get(accountKey);
      if (current) return [current, states] as const;
      const next = new Map(states);
      next.set(accountKey, candidate);
      return [candidate, next] as const;
    });
  });

  const redeem: CodexResetCreditCoordinator["Service"]["redeem"] = (accountKey, consume) =>
    Effect.gen(function* () {
      const state = yield* stateFor(accountKey);
      return yield* state.lock.withPermits(1)(
        Effect.gen(function* () {
          const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(accountKey));
          const filePath = path.join(config.stateDir, "reset-attempts", Encoding.encodeHex(digest));
          const existing = yield* fs
            .readFileString(filePath)
            .pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error),
              ),
            );
          const idempotencyKey = existing || (yield* crypto.randomUUIDv4);
          // Persist before sending. A crash or timeout retries the same provider request.
          if (!existing)
            yield* writeFileStringAtomically({ filePath, contents: idempotencyKey }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );
          const outcome = yield* consume(idempotencyKey);
          yield* fs.remove(filePath);
          return outcome;
        }),
      );
    });

  return { redeem } satisfies CodexResetCreditCoordinator["Service"];
});

export const layer = Layer.effect(CodexResetCreditCoordinator, make);

/**
 * Self-contained for tests: a counter-backed Crypto so keys are deterministic
 * and distinct without the platform layer.
 */
export const layerTest = Layer.effect(
  CodexResetCreditCoordinator,
  Effect.gen(function* () {
    let counter = 0;
    return yield* make.pipe(
      Effect.provideService(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => {
            counter += 1;
            return new Uint8Array(size).fill(counter);
          },
          digest: (_algorithm, data) => Effect.succeed(data),
        }),
      ),
    );
  }),
).pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-reset-credit-" })),
  Layer.provide(NodeServices.layer),
);

/** A successful redemption must remain successful when refreshing its balance fails. */
export const confirmResetCreditOutcome = <E, R>(
  outcome: ProviderConsumeResetCreditOutcome,
  refresh: Effect.Effect<boolean, E, R>,
): Effect.Effect<ProviderConsumeResetCreditResult, never, R> =>
  refresh.pipe(
    Effect.orElseSucceed(() => false),
    Effect.map((confirmed) => ({
      outcome,
      ...(!confirmed
        ? {
            warning: "Could not refresh the displayed limits. Refresh to check the latest balance.",
          }
        : {}),
    })),
  );
