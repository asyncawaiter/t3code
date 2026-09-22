import * as Stream from "effect/Stream";
import { Tool } from "effect/unstable/ai";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TaskToolkit, handlers } from "./tasks.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { McpInvocationContext } from "../McpInvocationContext.ts";
const scope = {
  environmentId: EnvironmentId.make("device"),
  threadId: ThreadId.make("source"),
  providerSessionId: "session",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["tasks"] as const),
  issuedAt: 1,
};
it.effect(
  "captures idempotently, restricts edits to this chat, and saves a brief without completing work",
  () =>
    Effect.gen(function* () {
      const toolkit = yield* TaskToolkit;
      const input = { id: "request", title: "Follow-up", notes: "Original request" };
      yield* toolkit.handle("task_create", input).pipe(Stream.unwrap, Stream.runCollect);
      yield* toolkit.handle("task_create", input).pipe(Stream.unwrap, Stream.runCollect);
      const service = yield* ServerSettingsService;
      const created = (yield* service.getSettings).workItems!;
      expect(created).toHaveLength(1);
      expect(created[0]!.source?.threadId).toBe(scope.threadId);
      yield* toolkit
        .handle("task_update", {
          id: input.id,
          expectedUpdatedAt: created[0]!.updatedAt,
          brief: "Do not allow this",
        })
        .pipe(
          Stream.unwrap,
          Stream.runCollect,
          Effect.provideService(McpInvocationContext, {
            ...scope,
            threadId: ThreadId.make("other"),
          }),
          Effect.result,
        );
      expect((yield* service.getSettings).workItems![0]!.brief).toBe("");
      yield* toolkit
        .handle("task_update", {
          id: input.id,
          expectedUpdatedAt: created[0]!.updatedAt,
          brief: "Relevant files and first step",
        })
        .pipe(Stream.unwrap, Stream.runCollect);
      const saved = (yield* service.getSettings).workItems![0]!;
      expect(saved.status).toBe("ready");
      expect(saved.notes).toBe(input.notes);
      expect(saved.brief).toBe("Relevant files and first step");
      const linked = {
        ...saved,
        chats: [
          {
            environmentId: scope.environmentId,
            threadId: ThreadId.make("reviewer"),
            purpose: "Review",
          },
          {
            environmentId: EnvironmentId.make("remote"),
            threadId: ThreadId.make("reviewer"),
            purpose: "Remote implementation",
          },
        ],
      };
      yield* service.updateSettings({ workItems: [linked] }, undefined, undefined, [saved]);
      yield* toolkit
        .handle("task_update", {
          id: input.id,
          expectedUpdatedAt: linked.updatedAt,
          notes: "Reviewer context",
          chatPurpose: "Final review",
          chatResult: "Verified the retry behavior",
        })
        .pipe(
          Stream.unwrap,
          Stream.runCollect,
          Effect.provideService(McpInvocationContext, {
            ...scope,
            threadId: ThreadId.make("reviewer"),
          }),
        );
      const edited = (yield* service.getSettings).workItems![0]!;
      expect(edited.notes).toBe("Reviewer context");
      expect(edited.chats?.[0]).toMatchObject({
        purpose: "Final review",
        result: "Verified the retry behavior",
      });
      expect(edited.chats?.[1]).toEqual(linked.chats[1]);
      yield* service.updateSettings(
        { workItems: [{ ...edited, deletedAt: "2026-09-22T12:00:00.000Z" }] },
        undefined,
        undefined,
        [edited],
      );
      yield* toolkit
        .handle("task_update", {
          id: input.id,
          expectedUpdatedAt: edited.updatedAt,
          notes: "Must not revive",
        })
        .pipe(Stream.unwrap, Stream.runCollect, Effect.result);
      expect((yield* service.getSettings).workItems![0]!.notes).toBe("Reviewer context");
    }).pipe(
      Effect.provide(handlers.pipe(Layer.provideMerge(ServerSettingsService.layerTest()))),
      Effect.provideService(McpInvocationContext, scope),
    ),
);

it("exports object parameter schemas for MCP registration", () => {
  for (const tool of Object.values(TaskToolkit.tools))
    expect(Tool.getJsonSchema(tool)).toHaveProperty("type", "object");
});
