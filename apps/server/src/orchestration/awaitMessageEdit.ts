import { OrchestrationDispatchCommandError, type OrchestrationCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";

/** Subscribe before dispatch so a fast completion cannot be missed. */
export const dispatchAndWaitForMessageEdit = Effect.fn("dispatchAndWaitForMessageEdit")(function* <
  R,
>(
  command: Extract<OrchestrationCommand, { type: "thread.checkpoint.revert" }>,
  dispatch: () => Effect.Effect<{ sequence: number }, OrchestrationDispatchCommandError, R>,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      const live = yield* engine.subscribeDomainEvents;
      const accepted = yield* dispatch();
      const result = yield* Stream.concat(
        engine.readEvents(accepted.sequence - 1, 10_000),
        live,
      ).pipe(
        Stream.filter(
          (event) =>
            (event.type === "thread.reverted" &&
              event.payload.requestId === command.commandId &&
              !event.payload.resending) ||
            (event.type === "thread.turn-start-requested" &&
              event.commandId === `server:rewind-send:${command.commandId}`) ||
            (event.type === "thread.activity-appended" &&
              event.payload.activity.kind === "checkpoint.revert.failed" &&
              event.payload.activity.payload !== null &&
              typeof event.payload.activity.payload === "object" &&
              "requestId" in event.payload.activity.payload &&
              event.payload.activity.payload.requestId === command.commandId),
        ),
        Stream.runHead,
        Effect.timeoutOrElse({
          duration: "2 minutes",
          orElse: () =>
            Effect.fail(
              new OrchestrationDispatchCommandError({
                message: "The edit has not finished. Reconnect and check the chat before retrying.",
              }),
            ),
        }),
      );
      if (Option.isNone(result))
        return yield* new OrchestrationDispatchCommandError({
          message: "The edit did not complete.",
        });
      const event = result.value;
      if (event.type === "thread.activity-appended")
        return yield* new OrchestrationDispatchCommandError({
          message: String(
            (event.payload.activity.payload !== null &&
            typeof event.payload.activity.payload === "object" &&
            "detail" in event.payload.activity.payload
              ? event.payload.activity.payload.detail
              : undefined) ?? "The edit failed. Your edited prompt is still available.",
          ),
        });
      return { sequence: event.sequence };
    }),
  );
});
