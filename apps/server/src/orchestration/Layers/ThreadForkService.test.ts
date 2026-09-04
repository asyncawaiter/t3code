import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { ServerConfig } from "../../config.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ThreadForkContextRepositoryLive } from "../../persistence/Layers/ThreadForkContext.ts";
import { ThreadForkContextRepository } from "../../persistence/Services/ThreadForkContext.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { ThreadForkService, ThreadForkServiceLive } from "./ThreadForkService.ts";

const asProjectId = (value: string) => ProjectId.make(value);
const asMessageId = (value: string) => MessageId.make(value);
const NOW = "2026-01-01T00:00:00.000Z";
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" };

function makeTestLayer() {
  const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
    prefix: "t3-thread-fork-service-test-",
  });
  const engineLayer = OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionSnapshotQueryLive),
    Layer.provide(OrchestrationProjectionPipelineLive),
  );
  return Layer.mergeAll(
    ThreadForkServiceLive.pipe(
      Layer.provide(engineLayer),
      Layer.provide(OrchestrationProjectionSnapshotQueryLive),
      Layer.provide(ThreadForkContextRepositoryLive),
    ),
    engineLayer,
    OrchestrationProjectionSnapshotQueryLive,
    ThreadForkContextRepositoryLive,
  ).pipe(
    Layer.provideMerge(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provideMerge(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provide(SqlitePersistenceMemory),
    Layer.provideMerge(ServerConfigLayer),
    Layer.provideMerge(NodeServices.layer),
  );
}

async function createSystem() {
  const runtime = ManagedRuntime.make(makeTestLayer());
  const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
  const snapshotQuery = await runtime.runPromise(Effect.service(ProjectionSnapshotQuery));
  const threadForkService = await runtime.runPromise(Effect.service(ThreadForkService));
  const forkContextRepository = await runtime.runPromise(Effect.service(ThreadForkContextRepository));
  return {
    engine,
    snapshotQuery,
    threadForkService,
    forkContextRepository,
    run: <A, E>(effect: Effect.Effect<A, E>) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  };
}

/** Seeds a project and a source thread with one user + one settled assistant message. */
async function seedSourceThread(
  system: Awaited<ReturnType<typeof createSystem>>,
  input: { readonly projectId: string; readonly threadId: string; readonly assistantText: string },
) {
  await system.run(
    system.engine.dispatch({
      type: "project.create",
      commandId: CommandId.make(`cmd-project-${input.projectId}`),
      projectId: asProjectId(input.projectId),
      title: "Source Project",
      workspaceRoot: `/tmp/${input.projectId}`,
      defaultModelSelection: modelSelection,
      createdAt: NOW,
    }),
  );
  await system.run(
    system.engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`cmd-thread-create-${input.threadId}`),
      threadId: ThreadId.make(input.threadId),
      projectId: asProjectId(input.projectId),
      title: "Source thread",
      modelSelection,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required",
      branch: null,
      worktreePath: null,
      createdAt: NOW,
    }),
  );
  await system.run(
    system.engine.dispatch({
      type: "thread.turn.start",
      commandId: CommandId.make(`cmd-turn-start-${input.threadId}`),
      threadId: ThreadId.make(input.threadId),
      message: {
        messageId: asMessageId(`${input.threadId}-user-1`),
        role: "user",
        text: "What should I do next?",
        attachments: [],
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required",
      createdAt: NOW,
    }),
  );
  const assistantMessageId = asMessageId(`${input.threadId}-assistant-1`);
  await system.run(
    system.engine.dispatch({
      type: "thread.message.assistant.delta",
      commandId: CommandId.make(`cmd-assistant-delta-${input.threadId}`),
      threadId: ThreadId.make(input.threadId),
      messageId: assistantMessageId,
      delta: input.assistantText,
      createdAt: NOW,
    }),
  );
  await system.run(
    system.engine.dispatch({
      type: "thread.message.assistant.complete",
      commandId: CommandId.make(`cmd-assistant-complete-${input.threadId}`),
      threadId: ThreadId.make(input.threadId),
      messageId: assistantMessageId,
      createdAt: NOW,
    }),
  );
  return { assistantMessageId };
}

function forkInput(overrides: {
  readonly threadId: string;
  readonly sourceThreadId: string;
  readonly sourceMessageId: string;
}) {
  return {
    threadId: ThreadId.make(overrides.threadId),
    sourceThreadId: ThreadId.make(overrides.sourceThreadId),
    sourceMessageId: asMessageId(overrides.sourceMessageId),
    title: "Forked thread",
    modelSelection,
    runtimeMode: "approval-required" as const,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    createdAt: NOW,
  };
}

describe("ThreadForkService", () => {
  it("creates a child thread with forkedFrom and stores the fork context row", async () => {
    const system = await createSystem();
    try {
      const { assistantMessageId } = await seedSourceThread(system, {
        projectId: "project-1",
        threadId: "thread-source",
        assistantText: "Here is the answer.",
      });

      const result = await system.run(
        system.threadForkService.forkThread(
          forkInput({
            threadId: "thread-child",
            sourceThreadId: "thread-source",
            sourceMessageId: assistantMessageId,
          }),
        ),
      );

      expect(result.threadId).toBe(ThreadId.make("thread-child"));
      expect(result.inheritedEntryCount).toBeGreaterThan(0);
      expect(result.omittedEntryCount).toBe(0);

      const snapshot = await system.run(system.snapshotQuery.getSnapshot());
      const child = snapshot.threads.find((entry) => entry.id === ThreadId.make("thread-child"));
      expect(child?.forkedFrom?.threadId).toBe(ThreadId.make("thread-source"));
      expect(child?.forkedFrom?.messageId).toBe(assistantMessageId);
      // The child renders no inherited messages; only the source thread carries them.
      expect(child?.messages).toEqual([]);

      const row = await system.run(
        system.forkContextRepository.get({ threadId: ThreadId.make("thread-child") }),
      );
      expect(Option.isSome(row)).toBe(true);
      if (Option.isSome(row)) {
        expect(row.value.entries.length).toBe(result.inheritedEntryCount);
        expect(row.value.consumedAt).toBeNull();
      }
    } finally {
      await system.dispose();
    }
  });

  it("rejects a fork whose source message does not exist", async () => {
    const system = await createSystem();
    try {
      await seedSourceThread(system, {
        projectId: "project-1",
        threadId: "thread-source",
        assistantText: "Here is the answer.",
      });

      const error = await system.run(
        system.threadForkService
          .forkThread(
            forkInput({
              threadId: "thread-child",
              sourceThreadId: "thread-source",
              sourceMessageId: "does-not-exist",
            }),
          )
          .pipe(Effect.flip),
      );

      expect(error.reason).toBe("source-message-not-found");
    } finally {
      await system.dispose();
    }
  });

  it("rejects a fork whose boundary message is not an assistant message", async () => {
    const system = await createSystem();
    try {
      await seedSourceThread(system, {
        projectId: "project-1",
        threadId: "thread-source",
        assistantText: "Here is the answer.",
      });

      const error = await system.run(
        system.threadForkService
          .forkThread(
            forkInput({
              threadId: "thread-child",
              sourceThreadId: "thread-source",
              sourceMessageId: "thread-source-user-1",
            }),
          )
          .pipe(Effect.flip),
      );

      expect(error.reason).toBe("source-message-not-assistant");
    } finally {
      await system.dispose();
    }
  });

  it("never stores a fork context row when the create is rejected", async () => {
    const system = await createSystem();
    try {
      const { assistantMessageId } = await seedSourceThread(system, {
        projectId: "project-1",
        threadId: "thread-source",
        assistantText: "Here is the answer.",
      });
      // A thread already occupying the child's id makes the decider reject
      // `thread.create` (requireThreadAbsent). The service now dispatches
      // before writing the row, so a rejection here must leave no row at all
      // rather than requiring cleanup.
      await system.run(
        system.engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-thread-collision"),
          threadId: ThreadId.make("thread-child"),
          projectId: asProjectId("project-1"),
          title: "Already exists",
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: NOW,
        }),
      );

      const exit = await system.run(
        Effect.exit(
          system.threadForkService.forkThread(
            forkInput({
              threadId: "thread-child",
              sourceThreadId: "thread-source",
              sourceMessageId: assistantMessageId,
            }),
          ),
        ),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      const row = await system.run(
        system.forkContextRepository.get({ threadId: ThreadId.make("thread-child") }),
      );
      expect(Option.isNone(row)).toBe(true);
    } finally {
      await system.dispose();
    }
  });

  it("gives the post-dispatch rejection its own message text", async () => {
    const system = await createSystem();
    try {
      const { assistantMessageId } = await seedSourceThread(system, {
        projectId: "project-1",
        threadId: "thread-source",
        assistantText: "Here is the answer.",
      });
      await system.run(
        system.engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-thread-collision-2"),
          threadId: ThreadId.make("thread-child-msg"),
          projectId: asProjectId("project-1"),
          title: "Already exists",
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: NOW,
        }),
      );

      const error = await system.run(
        system.threadForkService
          .forkThread(
            forkInput({
              threadId: "thread-child-msg",
              sourceThreadId: "thread-source",
              sourceMessageId: assistantMessageId,
            }),
          )
          .pipe(Effect.flip),
      );

      expect(error.reason).toBe("source-not-found");
      expect(error.message).toBe(
        "The fork could not be created: Orchestration command invariant failed (thread.create): " +
          "Thread 'thread-child-msg' already exists and cannot be created twice.",
      );
    } finally {
      await system.dispose();
    }
  });

  it("bounds captured entries to the send-time limit, dropping the oldest first", async () => {
    const system = await createSystem();
    try {
      await system.run(
        system.engine.dispatch({
          type: "project.create",
          commandId: CommandId.make("cmd-project-bounds"),
          projectId: asProjectId("project-1"),
          title: "Source Project",
          workspaceRoot: "/tmp/project-1",
          defaultModelSelection: modelSelection,
          createdAt: NOW,
        }),
      );
      await system.run(
        system.engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-thread-create-bounds"),
          threadId: ThreadId.make("thread-source"),
          projectId: asProjectId("project-1"),
          title: "Source thread",
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: NOW,
        }),
      );

      // Repeated long user/assistant turns until the total curated text
      // comfortably exceeds PROVIDER_SEND_TURN_MAX_INPUT_CHARS (120_000).
      // `thread.turn.start` only checks the thread exists (session/runtime
      // state is a reactor concern, not a decider invariant), so dispatching
      // it repeatedly against the same thread is a valid way to seed many
      // turns without a live provider session.
      const longText = "x".repeat(20_000);
      let lastAssistantMessageId = asMessageId("thread-source-assistant-0");
      for (let turn = 0; turn < 8; turn++) {
        await system.run(
          system.engine.dispatch({
            type: "thread.turn.start",
            commandId: CommandId.make(`cmd-turn-start-bounds-${turn}`),
            threadId: ThreadId.make("thread-source"),
            message: {
              messageId: asMessageId(`thread-source-user-${turn}`),
              role: "user",
              text: longText,
              attachments: [],
            },
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            runtimeMode: "approval-required",
            createdAt: NOW,
          }),
        );
        lastAssistantMessageId = asMessageId(`thread-source-assistant-${turn}`);
        await system.run(
          system.engine.dispatch({
            type: "thread.message.assistant.delta",
            commandId: CommandId.make(`cmd-assistant-delta-bounds-${turn}`),
            threadId: ThreadId.make("thread-source"),
            messageId: lastAssistantMessageId,
            delta: longText,
            createdAt: NOW,
          }),
        );
        await system.run(
          system.engine.dispatch({
            type: "thread.message.assistant.complete",
            commandId: CommandId.make(`cmd-assistant-complete-bounds-${turn}`),
            threadId: ThreadId.make("thread-source"),
            messageId: lastAssistantMessageId,
            createdAt: NOW,
          }),
        );
      }

      const result = await system.run(
        system.threadForkService.forkThread(
          forkInput({
            threadId: "thread-child-bounds",
            sourceThreadId: "thread-source",
            sourceMessageId: lastAssistantMessageId,
          }),
        ),
      );

      expect(result.omittedEntryCount).toBeGreaterThan(0);
      const row = await system.run(
        system.forkContextRepository.get({ threadId: ThreadId.make("thread-child-bounds") }),
      );
      expect(Option.isSome(row)).toBe(true);
      if (Option.isSome(row)) {
        expect(row.value.capturedChars).toBeLessThanOrEqual(120_000);
        // The most recent entry (the boundary assistant message) must survive.
        expect(row.value.entries.at(-1)?.text).toBe(longText);
      }
    } finally {
      await system.dispose();
    }
  });

  it("keeps the boundary entry even when it alone exceeds the capture limit", async () => {
    const system = await createSystem();
    try {
      await system.run(
        system.engine.dispatch({
          type: "project.create",
          commandId: CommandId.make("cmd-project-huge-boundary"),
          projectId: asProjectId("project-1"),
          title: "Source Project",
          workspaceRoot: "/tmp/project-1",
          defaultModelSelection: modelSelection,
          createdAt: NOW,
        }),
      );
      await system.run(
        system.engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-thread-create-huge-boundary"),
          threadId: ThreadId.make("thread-source"),
          projectId: asProjectId("project-1"),
          title: "Source thread",
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: NOW,
        }),
      );

      // A single boundary assistant message bigger than the whole
      // PROVIDER_SEND_TURN_MAX_INPUT_CHARS (120_000) budget on its own.
      const hugeText = "x".repeat(130_000);
      await system.run(
        system.engine.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-turn-start-huge-boundary"),
          threadId: ThreadId.make("thread-source"),
          message: {
            messageId: asMessageId("thread-source-user-huge"),
            role: "user",
            text: "short question",
            attachments: [],
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          createdAt: NOW,
        }),
      );
      const assistantMessageId = asMessageId("thread-source-assistant-huge");
      await system.run(
        system.engine.dispatch({
          type: "thread.message.assistant.delta",
          commandId: CommandId.make("cmd-assistant-delta-huge-boundary"),
          threadId: ThreadId.make("thread-source"),
          messageId: assistantMessageId,
          delta: hugeText,
          createdAt: NOW,
        }),
      );
      await system.run(
        system.engine.dispatch({
          type: "thread.message.assistant.complete",
          commandId: CommandId.make("cmd-assistant-complete-huge-boundary"),
          threadId: ThreadId.make("thread-source"),
          messageId: assistantMessageId,
          createdAt: NOW,
        }),
      );

      const result = await system.run(
        system.threadForkService.forkThread(
          forkInput({
            threadId: "thread-child-huge-boundary",
            sourceThreadId: "thread-source",
            sourceMessageId: assistantMessageId,
          }),
        ),
      );

      // The oldest entry (the short user question) is dropped, but the
      // boundary entry survives even though it alone busts the budget.
      expect(result.inheritedEntryCount).toBe(1);
      const row = await system.run(
        system.forkContextRepository.get({
          threadId: ThreadId.make("thread-child-huge-boundary"),
        }),
      );
      expect(Option.isSome(row)).toBe(true);
      if (Option.isSome(row)) {
        expect(row.value.entries.length).toBe(1);
        expect(row.value.entries[0]?.text).toBe(hugeText);
        expect(row.value.capturedChars).toBeGreaterThan(120_000);
      }
    } finally {
      await system.dispose();
    }
  });
});
