import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { ProviderAdapterRequestError } from "../provider/Errors.ts";
import { make } from "./UsageLimitsService.ts";

const codexInstance = ProviderInstanceId.make("codex");

describe("UsageLimitsService", () => {
  it.effect("reads adapters before the first snapshot and merges sparse events by window id", () =>
    Effect.gen(function* () {
      const events = yield* PubSub.unbounded<ProviderRuntimeEvent>();
      const service = yield* make({
        streamEvents: Stream.fromPubSub(events),
        instanceChanges: Stream.empty,
        listInstances: Effect.succeed([codexInstance]),
        getInstanceLabel: () => Effect.succeed("Personal"),
        getInstanceIdentity: () => Effect.succeed("codex:home:/home/me/.codex"),
        getAdapter: () =>
          Effect.succeed({
            provider: ProviderDriverKind.make("codex"),
            readAccountLimits: Effect.succeed({
              complete: true,
              plan: "Pro",
              windows: [
                {
                  id: "primary",
                  label: "5 hour",
                  usedPercent: 40,
                  resetsAt: null,
                  windowMinutes: 300,
                },
                {
                  id: "secondary",
                  label: "Weekly",
                  usedPercent: 60,
                  resetsAt: null,
                  windowMinutes: 10080,
                },
              ],
              resetCredits: { availableCount: 2, nextExpiresAt: null },
            }),
          }),
      });

      const subscription = yield* service.subscribe;
      const codex = subscription.latest.providers[0];
      assert.strictEqual(codex?.plan, "Pro");
      assert.strictEqual(codex?.instanceLabel, "Personal");
      assert.strictEqual(codex?.resetCredits?.availableCount, 2);
      assert.strictEqual(codex?.windows.length, 2);

      const next = yield* service.subscribe;
      // Let the forked ingestion fiber attach to the event stream first.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      yield* PubSub.publish(events, {
        eventId: EventId.make("evt-1"),
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstance,
        threadId: ThreadId.make("thread-1"),
        createdAt: "2026-09-03T08:00:00.000Z",
        type: "account.rate-limits.updated",
        payload: {
          limits: {
            windows: [
              {
                id: "primary",
                kind: "session",
                label: "5 hour",
                usedPercent: 55,
                windowDurationMins: 300,
              },
            ],
          },
        },
      } satisfies ProviderRuntimeEvent);
      const merged = Option.getOrThrow(
        yield* Stream.runHead(
          next.changes.pipe(
            Stream.filter((snapshot) =>
              snapshot.providers.some((entry) =>
                entry.windows.some((window) => window.usedPercent === 55),
              ),
            ),
          ),
        ),
      );
      const entry = merged.providers[0];
      assert.strictEqual(entry?.plan, "Pro");
      assert.strictEqual(
        entry?.windows.find((window) => window.id === "secondary")?.usedPercent,
        60,
      );
      assert.strictEqual(entry?.windows.find((window) => window.id === "primary")?.usedPercent, 55);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects reset consumption for providers without banked credits", () =>
    Effect.gen(function* () {
      const service = yield* make({
        streamEvents: Stream.empty,
        instanceChanges: Stream.empty,
        listInstances: Effect.succeed([]),
        getInstanceLabel: () => Effect.succeed(null),
        getInstanceIdentity: () => Effect.succeed(null),
        getAdapter: () => Effect.succeed({ provider: ProviderDriverKind.make("claudeAgent") }),
      });
      const result = yield* service
        .consumeReset({ instanceId: ProviderInstanceId.make("claudeAgent") })
        .pipe(Effect.flip);
      assert.strictEqual(result.reason, "unsupported");
    }).pipe(Effect.scoped),
  );

  it.effect("a complete read drops windows the account no longer reports", () =>
    Effect.gen(function* () {
      let windows = [
        { id: "primary", label: "5 hour", usedPercent: 40, resetsAt: null, windowMinutes: 300 },
        { id: "secondary", label: "Weekly", usedPercent: 60, resetsAt: null, windowMinutes: 10080 },
      ];
      const service = yield* make({
        streamEvents: Stream.empty,
        instanceChanges: Stream.empty,
        listInstances: Effect.succeed([codexInstance]),
        getInstanceLabel: () => Effect.succeed(null),
        getInstanceIdentity: () => Effect.succeed("codex:home:x"),
        getAdapter: () =>
          Effect.succeed({
            provider: ProviderDriverKind.make("codex"),
            readAccountLimits: Effect.sync(() => ({ complete: true, windows })),
          }),
      });
      const first = yield* service.subscribe;
      assert.deepStrictEqual(
        first.latest.providers[0]?.windows.map((window) => window.id),
        ["primary", "secondary"],
      );
      windows = windows.slice(0, 1);
      const second = yield* service.subscribe;
      assert.deepStrictEqual(
        second.latest.providers[0]?.windows.map((window) => window.id),
        ["primary"],
      );
    }).pipe(Effect.scoped),
  );

  it.effect("a failed read keeps the last good numbers and says so", () =>
    Effect.gen(function* () {
      let fail = false;
      const service = yield* make({
        streamEvents: Stream.empty,
        instanceChanges: Stream.empty,
        listInstances: Effect.succeed([codexInstance]),
        getInstanceLabel: () => Effect.succeed(null),
        getInstanceIdentity: () => Effect.succeed("codex:home:x"),
        getAdapter: () =>
          Effect.succeed({
            provider: ProviderDriverKind.make("codex"),
            readAccountLimits: Effect.suspend(() =>
              fail
                ? Effect.fail(
                    new ProviderAdapterRequestError({
                      provider: "codex",
                      method: "account/rateLimits/read",
                      detail: "Codex could not answer account/rateLimits/read.",
                    }),
                  )
                : Effect.succeed({
                    complete: true,
                    windows: [
                      {
                        id: "primary",
                        label: "5 hour",
                        usedPercent: 40,
                        resetsAt: null,
                        windowMinutes: 300,
                      },
                    ],
                  }),
            ),
          }),
      });
      const good = yield* service.subscribe;
      assert.strictEqual(good.latest.providers[0]?.readError, null);
      fail = true;
      const bad = yield* service.subscribe;
      const entry = bad.latest.providers[0];
      assert.strictEqual(entry?.windows[0]?.usedPercent, 40);
      assert.match(entry?.readError ?? "", /could not answer/);
    }).pipe(Effect.scoped),
  );
});

it.effect("refreshes the selected account, publishes shared usage, and coalesces clients", () =>
  Effect.gen(function* () {
    let upstreamPercent = 10;
    let displayedPercent = -1;
    let reads = 0;
    let identity = "personal";
    let fail = false;
    const service = yield* make({
      streamEvents: Stream.empty,
      instanceChanges: Stream.empty,
      listInstances: Effect.succeed([codexInstance]),
      getInstanceLabel: () => Effect.succeed(null),
      getInstanceIdentity: () => Effect.sync(() => identity),
      publishLimits: (limits) =>
        Effect.sync(() => {
          displayedPercent = limits.windows[0]?.usedPercent ?? -1;
        }),
      getAdapter: () =>
        Effect.succeed({
          provider: ProviderDriverKind.make("codex"),
          readAccountLimits: Effect.suspend(() => {
            reads++;
            return fail
              ? Effect.fail(
                  new ProviderAdapterRequestError({
                    provider: "codex",
                    method: "read",
                    detail: "offline",
                  }),
                )
              : Effect.succeed({
                  complete: true,
                  windows: [
                    {
                      id: "primary",
                      label: "5 hour",
                      usedPercent: upstreamPercent,
                      resetsAt: null,
                      windowMinutes: 300,
                    },
                  ],
                });
          }),
        }),
    });
    yield* Effect.all(
      Array.from({ length: 8 }, () => service.refreshAccount(codexInstance)),
      { concurrency: "unbounded" },
    );
    assert.strictEqual(reads, 1);
    yield* service.refreshAccount(ProviderInstanceId.make("missing"));
    assert.strictEqual(reads, 1);
    assert.strictEqual(displayedPercent, 10);
    upstreamPercent = 25;
    yield* TestClock.adjust("15 seconds");
    yield* service.refreshAccount(codexInstance);
    assert.strictEqual(displayedPercent, 25);
    assert.strictEqual(reads, 2);
    identity = "work";
    upstreamPercent = 3;
    yield* service.refreshAccount(codexInstance);
    assert.strictEqual(displayedPercent, 3);
    fail = true;
    yield* TestClock.adjust("15 seconds");
    yield* service.refreshAccount(codexInstance);
    assert.strictEqual(displayedPercent, 3);
    const failedReads = reads;
    yield* TestClock.adjust("15 seconds");
    yield* service.refreshAccount(codexInstance);
    assert.strictEqual(reads, failedReads);
    fail = false;
    yield* TestClock.adjust("45 seconds");
    yield* service.refreshAccount(codexInstance);
    assert.strictEqual(reads, failedReads + 1);
  }).pipe(Effect.scoped),
);
