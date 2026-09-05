import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationProject,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeThread(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    id: ThreadId.make("thread-source"),
    projectId: ProjectId.make("project-1"),
    title: "Source thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    deletedAt: null,
    messages: [
      {
        id: MessageId.make("msg-assistant-1"),
        role: "assistant",
        text: "Here is the answer.",
        turnId: null,
        streaming: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
    ...overrides,
  };
}

function makeProject(id: string): OrchestrationProject {
  return {
    id: ProjectId.make(id),
    title: `Project ${id}`,
    workspaceRoot: `/tmp/${id}`,
    defaultModelSelection: null,
    scripts: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

function makeReadModel(
  thread: OrchestrationThread,
  extraProjectIds: ReadonlyArray<string> = [],
): OrchestrationReadModel {
  const projectIds = new Set([thread.projectId as string, "project-1", ...extraProjectIds]);
  return {
    snapshotSequence: 0,
    projects: Array.from(projectIds, makeProject),
    threads: [thread],
    updatedAt: NOW,
  };
}

function forkCreateCommand(overrides: {
  readonly forkedFrom: {
    readonly threadId: string;
    readonly messageId: string;
    readonly turnId: null;
    readonly sequence: number;
    readonly forkedAt: string;
  };
  readonly projectId?: string;
}) {
  return {
    type: "thread.create" as const,
    commandId: CommandId.make("cmd-fork-1"),
    threadId: ThreadId.make("thread-child"),
    projectId: ProjectId.make(overrides.projectId ?? "project-1"),
    title: "Forked thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    branch: null,
    worktreePath: null,
    createdAt: NOW,
    forkedFrom: {
      threadId: ThreadId.make(overrides.forkedFrom.threadId),
      messageId: MessageId.make(overrides.forkedFrom.messageId),
      turnId: overrides.forkedFrom.turnId,
      sequence: overrides.forkedFrom.sequence,
      forkedAt: overrides.forkedFrom.forkedAt,
    },
  };
}

it.layer(NodeServices.layer)("forked thread.create decider", (it) => {
  it.effect("accepts a fork whose source thread, project, and message all line up", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel(makeThread());
      const result = yield* decideOrchestrationCommand({
        command: forkCreateCommand({
          forkedFrom: {
            threadId: "thread-source",
            messageId: "msg-assistant-1",
            turnId: null,
            sequence: 3,
            forkedAt: NOW,
          },
        }),
        readModel,
      });

      const events = Array.isArray(result) ? result : [result];
      const created = events[0];
      if (created?.type !== "thread.created") {
        return expect.fail(`Expected thread.created, received ${created?.type}.`);
      }
      expect(created.payload.forkedFrom?.threadId).toBe("thread-source");
      expect(created.payload.forkedFrom?.messageId).toBe("msg-assistant-1");
      expect(created.payload.forkedFrom?.sequence).toBe(3);
    }),
  );

  it.effect("rejects a fork whose source thread does not exist", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel(makeThread());
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: forkCreateCommand({
            forkedFrom: {
              threadId: "thread-missing",
              messageId: "msg-assistant-1",
              turnId: null,
              sequence: 0,
              forkedAt: NOW,
            },
          }),
          readModel,
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("rejects a fork whose source thread is deleted", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel(makeThread({ deletedAt: NOW }));
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: forkCreateCommand({
            forkedFrom: {
              threadId: "thread-source",
              messageId: "msg-assistant-1",
              turnId: null,
              sequence: 0,
              forkedAt: NOW,
            },
          }),
          readModel,
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("rejects a fork whose source thread is in a different project", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel(makeThread({ projectId: ProjectId.make("project-other") }));
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: forkCreateCommand({
            projectId: "project-1",
            forkedFrom: {
              threadId: "thread-source",
              messageId: "msg-assistant-1",
              turnId: null,
              sequence: 0,
              forkedAt: NOW,
            },
          }),
          readModel,
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect(
    "accepts a fork whose source message is absent from the command read model " +
      "(the read model never carries historical messages; ThreadForkService validates message existence)",
    () =>
      Effect.gen(function* () {
        const readModel = makeReadModel(makeThread());
        const result = yield* decideOrchestrationCommand({
          command: forkCreateCommand({
            forkedFrom: {
              threadId: "thread-source",
              messageId: "msg-missing",
              turnId: null,
              sequence: 0,
              forkedAt: NOW,
            },
          }),
          readModel,
        });

        const events = Array.isArray(result) ? result : [result];
        const created = events[0];
        if (created?.type !== "thread.created") {
          return expect.fail(`Expected thread.created, received ${created?.type}.`);
        }
        expect(created.payload.forkedFrom?.messageId).toBe("msg-missing");
      }),
  );
});

it.layer(NodeServices.layer)("fork titles", (it) => {
  it.effect("numbers repeated forks, skips existing suffixes, and preserves explicit names", () =>
    Effect.gen(function* () {
      const source = makeThread();
      const command = forkCreateCommand({
        forkedFrom: {
          threadId: source.id,
          messageId: "msg-assistant-1",
          turnId: null,
          sequence: 3,
          forkedAt: NOW,
        },
      });
      let readModel = makeReadModel(source);
      const create = (title: string) =>
        decideOrchestrationCommand({
          command: { ...command, title },
          readModel,
        });
      for (const expected of ["Source thread (fork 1)", "Source thread (fork 2)"]) {
        const result = yield* create(source.title);
        const event = Array.isArray(result) ? result[0] : result;
        if (event?.type !== "thread.created") return expect.fail("Expected thread.created");
        expect(event.payload.title).toBe(expected);
        readModel = {
          ...readModel,
          threads: [
            ...readModel.threads,
            makeThread({
              id: ThreadId.make(expected),
              title: event.payload.title,
              forkedFrom: command.forkedFrom,
            }),
          ],
        };
      }
      readModel = {
        ...readModel,
        threads: [
          ...readModel.threads,
          makeThread({ id: ThreadId.make("renamed"), title: "Source thread (fork 8)" }),
        ],
      };
      const result = yield* create(source.title);
      const event = Array.isArray(result) ? result[0] : result;
      expect(event).toMatchObject({ payload: { title: "Source thread (fork 9)" } });
      const explicit = yield* create("My alternative");
      expect(Array.isArray(explicit) ? explicit[0] : explicit).toMatchObject({
        payload: { title: "My alternative" },
      });
      const nested = yield* decideOrchestrationCommand({
        command: {
          ...command,
          title: "Source thread (fork 1)",
          forkedFrom: { ...command.forkedFrom, threadId: ThreadId.make("Source thread (fork 1)") },
        },
        readModel,
      });
      expect(Array.isArray(nested) ? nested[0] : nested).toMatchObject({
        payload: { title: "Source thread (fork 9)" },
      });
    }),
  );
});
