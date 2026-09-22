import {
  CommandId,
  MessageId,
  workItemPrompt,
  workItemPreparationThread,
  type WorkItem,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Scope from "effect/Scope";
import { ServerSettingsService } from "../serverSettings.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ServerConfig } from "../config.ts";
import { resolveAttachmentPathById } from "../attachmentStore.ts";
import { forkParked } from "../serverActivation.ts";

export class TaskPreparationReactor extends Context.Service<
  TaskPreparationReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly drain: Effect.Effect<void>;
  }
>()("t3/orchestration/TaskPreparationReactor") {}

export function preparationPrompt(task: WorkItem) {
  return `Prepare the handoff for task ${task.id}. This is preparation only: do not implement the task, modify files, or start other agents. Summarize the intended outcome, relevant decisions and files, open questions, and a first step. Use task_list and task_update to save the brief. Keep original notes and source links. If tools are unavailable, return the brief in your answer.\n\n${workItemPrompt(task)}`;
}

export const make = Effect.gen(function* () {
  const settings = yield* ServerSettingsService;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const environment = yield* ServerEnvironment;
  const { attachmentsDir } = yield* ServerConfig;
  const environmentId = yield* environment.getEnvironmentId;
  const sweep = Effect.fn("TaskPreparationReactor.sweep")(function* () {
    const tasks = (yield* settings.getSettings).workItems ?? [];
    const occupied = new Set<string>();
    for (const task of tasks) {
      const preparation = task.preparation;
      if (task.deletedAt || !preparation || preparation.state === "failed") continue;
      const threadId = workItemPreparationThread(task);
      if (!threadId || occupied.has(threadId)) continue;
      const update = (next: WorkItem) =>
        settings
          .updateSettings({ workItems: [next] }, undefined, undefined, [task])
          .pipe(Effect.ignore);
      const preparationEnvironmentId = task.preparationThreadId
        ? environmentId
        : (task.source?.environmentId ?? task.executionEnvironmentId ?? environmentId);
      if (preparationEnvironmentId !== environmentId) {
        yield* update({
          ...task,
          preparation: {
            ...preparation,
            state: "failed",
            error: "Choose a preparation chat on this task's storage device.",
          },
        });
        continue;
      }
      const detail = yield* snapshots.getThreadDetailById(threadId);
      if (Option.isNone(detail) || detail.value.archivedAt) {
        yield* update({
          ...task,
          preparation: {
            ...preparation,
            state: "failed",
            error: "The preparation chat is unavailable. Restore it or choose another chat.",
          },
        });
        continue;
      }
      const thread = detail.value;
      const messageId = MessageId.make(`task-prepare-${task.id}-${preparation.requestedAt}`);
      const sent = thread.messages.some((message) => message.id === messageId);
      const pendingUser = thread.messages.findLast((message) => message.role === "user");
      const busy =
        thread.session?.status === "running" ||
        thread.session?.status === "starting" ||
        thread.latestTurn?.state === "running" ||
        (!!pendingUser &&
          thread.session?.status !== "error" &&
          (!thread.latestTurn || pendingUser.createdAt > thread.latestTurn.requestedAt));
      if (sent) {
        if (!busy)
          yield* update({
            ...task,
            preparation: {
              ...preparation,
              state: "failed",
              error:
                "The preparation turn finished without saving a brief. Review its answer in the preparation chat.",
            },
          });
        else if (preparation.state !== "running")
          yield* update({ ...task, preparation: { ...preparation, state: "running" } });
        continue;
      }
      if (busy) continue;
      const attachments = (task.attachments ?? []).map((file) => ({
        name: file.name,
        path: resolveAttachmentPathById({ attachmentsDir, attachmentId: file.id }),
      }));
      if (attachments.some((file) => file.path === null)) {
        yield* update({
          ...task,
          preparation: {
            ...preparation,
            state: "failed",
            error: "An attachment is unavailable. Reattach it before preparing this task.",
          },
        });
        continue;
      }
      // Claim through the same compare-and-swap as cancellation before dispatching.
      const claimed = {
        ...task,
        updatedAt: DateTime.formatIso(yield* DateTime.now),
        preparation: { ...preparation, state: "running" as const },
      };
      const claim = yield* settings
        .updateSettings({ workItems: [claimed] }, undefined, undefined, [task])
        .pipe(Effect.result);
      if (claim._tag === "Failure") continue;
      occupied.add(threadId);
      // The authoritative precondition prevents a concurrent user turn from being interrupted.
      yield* engine
        .dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(messageId),
          threadId,
          ifThreadUnchangedSince: thread.updatedAt,
          message: {
            messageId,
            role: "user",
            text:
              preparationPrompt(task) +
              (attachments.length
                ? "\n\nTask attachments on this device:\n" +
                  attachments.map((file) => `${file.name}: ${file.path}`).join("\n")
                : ""),
            attachments: [],
          },
          runtimeMode: thread.runtimeMode,
          interactionMode: "plan",
          createdAt: DateTime.formatIso(yield* DateTime.now),
        })
        .pipe(
          Effect.catch((cause) =>
            settings
              .updateSettings(
                {
                  workItems: [
                    {
                      ...claimed,
                      preparation: {
                        ...preparation,
                        state: "failed",
                        error:
                          cause instanceof Error
                            ? cause.message
                            : "Preparation could not start. Retry when the chat is idle.",
                      },
                    },
                  ],
                },
                undefined,
                undefined,
                [claimed],
              )
              .pipe(Effect.ignore),
          ),
        );
    }
  });
  const worker = yield* makeDrainableWorker(() =>
    sweep().pipe(
      Effect.catch((cause) => Effect.logWarning("Task preparation deferred", { cause })),
    ),
  );
  const start = Effect.fn("TaskPreparationReactor.start")(function* () {
    const changes = yield* settings.subscribeChanges;
    const events = yield* engine.subscribeDomainEvents;
    yield* worker.enqueue(undefined);
    yield* forkParked(Stream.runForEach(changes, () => worker.enqueue(undefined)));
    yield* forkParked(
      Stream.runForEach(
        events.pipe(
          Stream.filter(
            (event) =>
              event.type === "thread.session-set" ||
              event.type === "thread.turn-diff-completed" ||
              event.type === "thread.message-sent",
          ),
        ),
        () => worker.enqueue(undefined),
      ),
    );
  });
  return { start, drain: worker.drain, sweep };
});
export const layer = Layer.effect(TaskPreparationReactor, make);
