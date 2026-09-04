/**
 * ThreadForkService - Handles "Fork in a new tab".
 *
 * Captures a curated, portable-text slice of the source thread up to and
 * including the boundary assistant message, stores it in
 * `thread_fork_context`, and dispatches the `thread.create` command that
 * creates the child thread with `forkedFrom` set. The child's first turn
 * consumes the stored row to prepend the captured context to the provider
 * input (see ProviderCommandReactor.processTurnStartRequested).
 *
 * @module ThreadForkService
 */
import {
  CommandId,
  OrchestrationForkThreadError,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type OrchestrationForkThreadInput,
  type OrchestrationForkThreadResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ThreadForkContextRepository } from "../../persistence/Services/ThreadForkContext.ts";
import { curateForkEntries, serializeForkEntry } from "../forkContext.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

export interface ThreadForkServiceShape {
  readonly forkThread: (
    input: OrchestrationForkThreadInput,
  ) => Effect.Effect<OrchestrationForkThreadResult, OrchestrationForkThreadError>;
}

export class ThreadForkService extends Context.Service<
  ThreadForkService,
  ThreadForkServiceShape
>()("t3/orchestration/Layers/ThreadForkService") {}

const make = Effect.gen(function* () {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const forkContextRepository = yield* ThreadForkContextRepository;

  const forkThread: ThreadForkServiceShape["forkThread"] = Effect.fn(
    "ThreadForkService.forkThread",
  )(function* (input: OrchestrationForkThreadInput) {
    const snapshotOption = yield* projectionSnapshotQuery
      .getThreadDetailSnapshot(input.sourceThreadId)
      .pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationForkThreadError({
              reason: "source-not-found",
              message: "Failed to read the source thread.",
              cause,
            }),
        ),
      );

    if (Option.isNone(snapshotOption)) {
      return yield* new OrchestrationForkThreadError({
        reason: "source-not-found",
        message: `Source thread '${input.sourceThreadId}' was not found.`,
      });
    }
    const { thread: sourceThread, snapshotSequence } = snapshotOption.value;

    const sourceMessage = sourceThread.messages.find(
      (message) => message.id === input.sourceMessageId,
    );
    if (!sourceMessage) {
      return yield* new OrchestrationForkThreadError({
        reason: "source-message-not-found",
        message: `Source message '${input.sourceMessageId}' was not found on thread '${input.sourceThreadId}'.`,
      });
    }
    if (sourceMessage.role !== "assistant") {
      return yield* new OrchestrationForkThreadError({
        reason: "source-message-not-assistant",
        message: "Only an assistant message can be the boundary of a fork.",
      });
    }

    const entries = curateForkEntries({
      messages: sourceThread.messages,
      activities: sourceThread.activities,
      proposedPlans: sourceThread.proposedPlans,
      boundaryMessageId: input.sourceMessageId,
    });

    // Bound at capture: drop the OLDEST whole entries until the stored
    // transcript fits the send-time limit, so a huge source thread never
    // blows up the stored row. The exact packing (with the wrapper markup
    // and the real, possibly citation-expanded user text) happens again at
    // send time in ProviderCommandReactor. The boundary (newest/last) entry
    // is never dropped here; send-time head truncation handles the case
    // where it alone exceeds the limit.
    let boundedEntries = entries;
    let capturedChars = entries.reduce(
      (total, entry) => total + serializeForkEntry(entry).length,
      0,
    );
    let omittedEntryCount = 0;
    while (capturedChars > PROVIDER_SEND_TURN_MAX_INPUT_CHARS && boundedEntries.length > 1) {
      const [dropped, ...rest] = boundedEntries;
      capturedChars -= serializeForkEntry(dropped!).length;
      boundedEntries = rest;
      omittedEntryCount += 1;
    }

    // Dispatch the command first: the decider re-validates the same
    // source-thread/message invariants already checked above, so a
    // rejection here means the source thread changed (deleted, or the
    // message went away) in the race between those reads and this dispatch.
    // Only once the child thread is actually created do we persist the fork
    // context row, so a rejected dispatch never leaves an orphaned row that
    // would need cleaning up.
    yield* orchestrationEngine
      .dispatch({
        type: "thread.create",
        // Deterministic on the client-minted child threadId (unique per
        // fork attempt), so a retried RPC dispatches an idempotent command
        // instead of minting a fresh id via a platform random source.
        commandId: CommandId.make(`fork-thread:${input.threadId}`),
        threadId: input.threadId,
        projectId: sourceThread.projectId,
        title: input.title,
        modelSelection: input.modelSelection,
        runtimeMode: input.runtimeMode,
        interactionMode: input.interactionMode,
        branch: sourceThread.branch,
        worktreePath: sourceThread.worktreePath,
        createdAt: input.createdAt,
        forkedFrom: {
          threadId: input.sourceThreadId,
          messageId: input.sourceMessageId,
          turnId: sourceMessage.turnId,
          sequence: snapshotSequence,
          forkedAt: input.createdAt,
        },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationForkThreadError({
              reason: "source-not-found",
              message: `The fork could not be created: ${
                cause instanceof Error ? cause.message : String(cause)
              }`,
              cause,
            }),
        ),
      );

    // Only writes the row when none exists yet for this child thread id, so
    // a duplicate/retried RPC (same idempotent commandId) never overwrites
    // context a prior attempt already stored (and possibly already consumed).
    yield* forkContextRepository
      .upsert({
        threadId: input.threadId,
        sourceThreadId: input.sourceThreadId,
        sourceMessageId: input.sourceMessageId,
        sourceSequence: snapshotSequence,
        entries: boundedEntries,
        capturedChars,
        consumedAt: null,
        createdAt: input.createdAt,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationForkThreadError({
              reason: "source-not-found",
              message: "Failed to store the fork context.",
              cause,
            }),
        ),
      );

    return {
      threadId: input.threadId,
      inheritedEntryCount: boundedEntries.length,
      omittedEntryCount,
    } satisfies OrchestrationForkThreadResult;
  });

  return { forkThread } satisfies ThreadForkServiceShape;
});

export const ThreadForkServiceLive = Layer.effect(ThreadForkService, make);
