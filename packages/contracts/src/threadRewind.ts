import type { MessageId } from "./baseSchemas.ts";
import type { OrchestrationThread } from "./orchestration.ts";

/** Only a standalone latest user turn can be replaced without discarding other prompts. */
export function resolveLatestMessageRewind(thread: OrchestrationThread, messageId: MessageId) {
  const users = thread.messages.filter((message) => message.role === "user");
  const source = users.at(-1);
  if (!source || source.id !== messageId)
    return { error: "A newer message was sent. Reopen the latest message to edit it." } as const;
  const turn = thread.latestTurn;
  if (thread.archivedAt) return { error: "Unarchive this chat before editing." } as const;
  if (
    !turn ||
    turn.state === "running" ||
    turn.completedAt === null ||
    thread.session?.status === "running" ||
    thread.session?.status === "starting"
  ) {
    return { error: "Stop the current turn and wait for it to finish before editing." } as const;
  }
  if (
    (source.turnId !== null && source.turnId !== turn.turnId) ||
    source.createdAt > turn.completedAt
  )
    return { error: "This message does not belong to the latest turn." } as const;
  const previousUser = users.at(-2);
  if (
    previousUser &&
    (previousUser.turnId === turn.turnId || previousUser.createdAt >= turn.requestedAt)
  ) {
    return {
      error: "This turn contains multiple user messages. Rewind the whole turn instead.",
    } as const;
  }
  const checkpoint = thread.checkpoints.find((entry) => entry.turnId === turn.turnId);
  const turnCount = checkpoint
    ? Math.max(0, checkpoint.checkpointTurnCount - 1)
    : Math.max(0, thread.checkpoints.length - 1);
  const fileCheckpoint =
    turnCount === 0
      ? checkpoint
      : thread.checkpoints.find((entry) => entry.checkpointTurnCount === turnCount);
  return {
    sourceMessageId: source.id,
    removedTurnId: turn.turnId,
    turnCount,
    canRestoreFiles: checkpoint?.status === "ready" && fileCheckpoint?.status === "ready",
  } as const;
}
