import type { RpcSession } from "../rpc/session.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { it } from "@effect/vitest";
import { beforeEach, expect, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { AVAILABLE_CONNECTION_STATE, PrimaryConnectionTarget } from "../connection/model.ts";
import { WS_METHODS, ProjectInstructionsError, EnvironmentId } from "@t3tools/contracts";
const rpc = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../rpc/client.ts", () => ({ request: rpc.request }));
import { loadProjectInstructions } from "./projectCommands.ts";
const supervisorLayer = Layer.effect(
  EnvironmentSupervisor,
  Effect.gen(function* () {
    return EnvironmentSupervisor.of({
      target: new PrimaryConnectionTarget({
        environmentId: EnvironmentId.make("test"),
        label: "Test",
        httpBaseUrl: "http://localhost",
        wsBaseUrl: "ws://localhost",
      }),
      state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
      session: yield* SubscriptionRef.make(Option.none<RpcSession>()),
      prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
      connect: Effect.void,
      disconnect: Effect.void,
      retryNow: Effect.void,
    });
  }),
);
beforeEach(() => vi.clearAllMocks());
it.effect("reads indexed instruction files when an older device rejects the new RPC", () =>
  Effect.gen(function* () {
    rpc.request.mockImplementation((tag) =>
      tag === WS_METHODS.projectsInstructions
        ? Effect.die("Unknown request tag: projects.instructions")
        : Effect.succeed({
            entries: [
              { path: "AGENTS.md", kind: "file" },
              { path: "docs/AGENTS.md", kind: "file" },
              { path: ".claude/rules/style.md", kind: "file" },
              { path: "README.md", kind: "file" },
            ],
            truncated: false,
          }),
    );
    const result = yield* loadProjectInstructions({ cwd: "/work/prasna" });
    expect(result.files.map((file) => [file.path, file.scope])).toEqual([
      ["/work/prasna/AGENTS.md", "root"],
      ["/work/prasna/docs/AGENTS.md", "subfolder"],
      ["/work/prasna/.claude/rules/style.md", "subfolder"],
    ]);
    expect(result.warnings.join(" ")).toContain("older");
    expect(rpc.request).toHaveBeenLastCalledWith(WS_METHODS.projectsListEntries, {
      cwd: "/work/prasna",
    });
  }).pipe(Effect.provide(supervisorLayer)),
);
it.effect("preserves actual scan failures instead of falling back silently", () =>
  Effect.gen(function* () {
    const failure = new ProjectInstructionsError({ message: "Permission denied" });
    rpc.request.mockReturnValue(Effect.fail(failure));
    const result = yield* Effect.exit(loadProjectInstructions({ cwd: "/work/private" }));
    expect(Exit.isFailure(result) && Cause.squash(result.cause)).toBe(failure);
    expect(rpc.request).toHaveBeenCalledTimes(1);
  }).pipe(Effect.provide(supervisorLayer)),
);
