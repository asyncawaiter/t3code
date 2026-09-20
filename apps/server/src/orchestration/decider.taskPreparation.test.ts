import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { decideOrchestrationCommand } from "./decider.ts";
const UPDATED_AT = "2026-01-01T00:00:00.000Z";

const readModel: OrchestrationReadModel = {
  snapshotSequence: 0,
  projects: [],
  threads: [
    {
      id: ThreadId.make("thread-1"),
      projectId: ProjectId.make("project-1"),
      title: "Manual title",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
  updatedAt: UPDATED_AT,
};

it.effect("rejects preparation when the chat changed after the idle snapshot", () =>
  Effect.gen(function* () {
    const command = {
      type: "thread.turn.start" as const,
      commandId: CommandId.make("prepare"),
      threadId: ThreadId.make("thread-1"),
      ifThreadUnchangedSince: "2025-01-01T00:00:00.000Z",
      message: {
        messageId: MessageId.make("prepare-message"),
        role: "user" as const,
        text: "Prepare brief only",
        attachments: [],
      },
      runtimeMode: "full-access" as const,
      interactionMode: "plan" as const,
      createdAt: UPDATED_AT,
    };
    const result = yield* decideOrchestrationCommand({
      readModel,
      command,
    }).pipe(Effect.result);
    expect(result._tag).toBe("Failure");
  }).pipe(Effect.provide(NodeServices.layer)),
);
