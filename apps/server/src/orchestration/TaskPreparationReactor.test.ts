import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  MessageId,
  ProjectId,
  ThreadId,
  ProviderInstanceId,
  type OrchestrationThread,
  type OrchestrationCommand,
  type WorkItem,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as ServerConfig from "../config.ts";
import { NodeServices } from "@effect/platform-node";
import * as Layer from "effect/Layer";
import { make } from "./TaskPreparationReactor.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
const now = "2026-09-20T00:00:00.000Z";
const environmentId = EnvironmentId.make("device");
const threadId = ThreadId.make("source-chat");
const item: WorkItem = {
  id: "task",
  title: "Follow-up",
  notes: "Request",
  brief: "",
  status: "parked",
  profileId: null,
  spaceId: null,
  projectId: null,
  source: { environmentId, threadId },
  threadId: null,
  links: [],
  createdAt: now,
  updatedAt: now,
  preparation: { requestedAt: now, state: "queued" },
};
const idle: OrchestrationThread = {
  id: threadId,
  projectId: ProjectId.make("folder"),
  title: "Source",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  deletedAt: null,
  messages: [],
  activities: [],
  checkpoints: [],
  proposedPlans: [],
  session: null,
};
it.effect("defers busy chats, honors cancellation, and dispatches preparation once", () =>
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService;
    let thread = { ...idle };
    const commands: OrchestrationCommand[] = [];
    const reactor = yield* make.pipe(
      Effect.provideService(ServerEnvironment, {
        getEnvironmentId: Effect.succeed(environmentId),
        getDescriptor: Effect.die("unused"),
      }),
      Effect.provideService(ProjectionSnapshotQuery, {
        getUserInputActivity: () => Effect.die("unused"),
        getCommandReadModel: () => Effect.die("unused"),
        getSnapshot: () => Effect.die("unused"),
        getShellSnapshot: () => Effect.die("unused"),
        getArchivedShellSnapshot: () => Effect.die("unused"),
        searchThreads: () => Effect.die("unused"),
        getSnapshotSequence: () => Effect.die("unused"),
        getCounts: () => Effect.die("unused"),
        getEventReplayStats: () => Effect.die("unused"),
        getActiveProjectByWorkspaceRoot: () => Effect.die("unused"),
        getProjectShellById: () => Effect.die("unused"),
        getFirstActiveThreadIdByProjectId: () => Effect.die("unused"),
        getImportedAgentSessionSources: () => Effect.die("unused"),
        getThreadCheckpointContext: () => Effect.die("unused"),
        getFullThreadDiffContext: () => Effect.die("unused"),
        getThreadShellById: () => Effect.die("unused"),
        getThreadRuntimeContext: () => Effect.die("unused"),
        getTurnStartMessage: () => Effect.die("unused"),
        getThreadDetailSnapshot: () => Effect.die("unused"),
        getThreadDetailById: () => Effect.succeed(Option.some(thread)),
      }),
      Effect.provideService(OrchestrationEngineService, {
        readEvents: () => Stream.never,
        readThreadEvents: () => Stream.never,
        getThreadReplayStats: () => Effect.die("unused"),
        latestSequence: Effect.succeed(0),
        streamDomainEvents: Stream.never,
        subscribeDomainEvents: Effect.succeed(Stream.never),
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command);
            if (command.type === "thread.turn.start")
              thread = {
                ...thread,
                messages: [
                  {
                    id: command.message.messageId,
                    role: "user",
                    text: command.message.text,
                    createdAt: command.createdAt,
                    updatedAt: command.createdAt,
                    streaming: false,
                    turnId: null,
                    attachments: [],
                  },
                ],
              };
            return { sequence: commands.length };
          }),
      }),
    );
    yield* settings.updateSettings({ workItems: [item] }, undefined, undefined, []);
    // A user prompt waiting to start also counts as busy.
    thread = {
      ...idle,
      messages: [
        {
          id: MessageId.make("pending"),
          role: "user",
          text: "Current work",
          createdAt: now,
          updatedAt: now,
          streaming: false,
          turnId: null,
          attachments: [],
        },
      ],
    };
    yield* reactor.sweep();
    expect(commands).toHaveLength(0);
    yield* settings.updateSettings(
      { workItems: [{ ...item, preparation: null }] },
      undefined,
      undefined,
      [item],
    );
    thread = idle;
    yield* reactor.sweep();
    expect(commands).toHaveLength(0);
    yield* settings.updateSettings({ workItems: [item] }, undefined, undefined, [
      { ...item, preparation: null },
    ]);
    yield* reactor.sweep();
    yield* reactor.sweep();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "thread.turn.start",
      interactionMode: "plan",
      ifThreadUnchangedSince: now,
    });
    expect((yield* settings.getSettings).workItems![0]!.status).toBe("parked");
  }).pipe(
    Effect.provide(
      Layer.merge(
        ServerSettingsService.layerTest(),
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-task-prep-test-" }).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
    Effect.scoped,
  ),
);
