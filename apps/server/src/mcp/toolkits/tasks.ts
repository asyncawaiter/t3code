import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit, McpServer } from "effect/unstable/ai";
import * as Layer from "effect/Layer";
import { WorkItem, WorkItems, ProjectId, indexProfileSpaces } from "@t3tools/contracts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { McpInvocationContext } from "../McpInvocationContext.ts";

class TaskToolError extends Schema.TaggedError<TaskToolError>()("TaskToolError", {
  message: Schema.String,
}) {}
const requireTaskScope = Effect.gen(function* () {
  const scope = yield* McpInvocationContext;
  if (!scope.capabilities.has("tasks"))
    return yield* new TaskToolError({ message: "Task access is unavailable for this session." });
  return scope;
});
const dependencies = [ServerSettingsService, McpInvocationContext];
export const TaskToolkit = Toolkit.make(
  Tool.make("task_list", {
    description:
      "List saved tasks linked to this chat or captured from it. Tasks are durable and independent of chat turns. A finished turn does not complete a task.",
    parameters: Schema.Struct({ status: Schema.optionalKey(WorkItem.fields.status) }),
    success: Schema.Struct({ tasks: WorkItems }),
    failure: TaskToolError,
    dependencies,
  }).annotate(Tool.Readonly, true),
  Tool.make("task_create", {
    description:
      "Capture a user-requested follow-up without starting it. Preserve the request, useful context, source links, and a concise handoff brief when known. The task links back to this chat automatically. Use the same id when retrying. Do not invent profile, Space, or folder IDs.",
    parameters: Schema.Struct({
      id: WorkItem.fields.id,
      title: WorkItem.fields.title,
      notes: WorkItem.fields.notes,
      brief: Schema.optionalKey(WorkItem.fields.brief),
      links: Schema.optionalKey(WorkItem.fields.links),
      projectId: Schema.optionalKey(ProjectId),
      profileId: Schema.optionalKey(Schema.String),
      spaceId: Schema.optionalKey(Schema.String),
    }),
    success: WorkItem,
    failure: TaskToolError,
    dependencies,
  }).annotate(Tool.Destructive, false),
  Tool.make("task_update", {
    description:
      "Update a task linked to this chat, including its handoff brief. Read task_list first and supply updatedAt as expectedUpdatedAt. A brief should state the outcome, decisions, relevant files, open questions, and first step. Do not mark work done just because a turn finished.",
    parameters: Schema.Struct({
      id: WorkItem.fields.id,
      expectedUpdatedAt: Schema.String,
      title: Schema.optionalKey(WorkItem.fields.title),
      notes: Schema.optionalKey(WorkItem.fields.notes),
      brief: Schema.optionalKey(WorkItem.fields.brief),
      status: Schema.optionalKey(WorkItem.fields.status),
      links: Schema.optionalKey(WorkItem.fields.links),
    }),
    success: WorkItem,
    failure: TaskToolError,
    dependencies,
  }).annotate(Tool.Destructive, false),
);

const failure = (cause: unknown) =>
  new TaskToolError({
    message: cause instanceof Error ? cause.message : "Could not save the task.",
  });
export const handlers = TaskToolkit.toLayer({
  task_list: (input) =>
    Effect.gen(function* () {
      const scope = yield* requireTaskScope;
      const service = yield* ServerSettingsService;
      const settings = yield* service.getSettings;
      return {
        tasks: (settings.workItems ?? []).filter(
          (item) =>
            (!input.status || item.status === input.status) &&
            (item.threadId === scope.threadId ||
              (item.source?.environmentId === scope.environmentId &&
                item.source.threadId === scope.threadId)),
        ),
      };
    }).pipe(Effect.mapError(failure)),
  task_create: (input) =>
    Effect.gen(function* () {
      const scope = yield* requireTaskScope;
      const service = yield* ServerSettingsService;
      const settings = yield* service.getSettings;
      const existing = settings.workItems?.find((item) => item.id === input.id);
      if (existing) {
        if (
          existing.source?.environmentId !== scope.environmentId ||
          existing.source.threadId !== scope.threadId
        )
          return yield* new TaskToolError({
            message: "That task ID already exists. Choose another ID.",
          });
        return existing;
      }
      const placement = indexProfileSpaces(settings.profiles).get(
        `${scope.environmentId}:${scope.threadId}`,
      );
      const now = DateTime.formatIso(yield* DateTime.now);
      const item: WorkItem = {
        id: input.id,
        title: input.title,
        notes: input.notes,
        brief: input.brief ?? "",
        links: input.links ?? [],
        profileId: input.profileId ?? placement?.profile.id ?? null,
        spaceId: input.spaceId ?? placement?.space.id ?? null,
        projectId:
          input.projectId ??
          (placement
            ? ProjectId.make(placement.projectKey.slice(scope.environmentId.length + 1))
            : null),
        source: { environmentId: scope.environmentId, threadId: scope.threadId },
        threadId: null,
        status: "parked",
        createdAt: now,
        updatedAt: now,
      };
      yield* service.updateSettings({ workItems: [item] }, undefined, undefined, []);
      return item;
    }).pipe(Effect.mapError(failure)),
  task_update: ({ id, expectedUpdatedAt, ...patch }) =>
    Effect.gen(function* () {
      const scope = yield* requireTaskScope;
      const service = yield* ServerSettingsService;
      const settings = yield* service.getSettings;
      const existing = settings.workItems?.find((item) => item.id === id);
      if (
        !existing ||
        (existing.threadId !== scope.threadId &&
          !(
            existing.source?.environmentId === scope.environmentId &&
            existing.source.threadId === scope.threadId
          ))
      )
        return yield* new TaskToolError({ message: "This task is not linked to this chat." });
      if (existing.updatedAt !== expectedUpdatedAt)
        return yield* new TaskToolError({
          message: "The task changed. Read it again before updating.",
        });
      const item = {
        ...existing,
        ...patch,
        ...(patch.brief !== undefined
          ? {
              preparation: null,
              status:
                patch.status ??
                (existing.status === "parked" ? ("ready" as const) : existing.status),
            }
          : {}),
        updatedAt: DateTime.formatIso(yield* DateTime.now),
      };
      yield* service.updateSettings({ workItems: [item] }, undefined, undefined, [existing]);
      return item;
    }).pipe(Effect.mapError(failure)),
});
export const TaskToolkitRegistrationLive = McpServer.toolkit(TaskToolkit).pipe(
  Layer.provide(handlers),
);
