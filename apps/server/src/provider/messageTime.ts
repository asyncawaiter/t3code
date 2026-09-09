import * as DateTime from "effect/DateTime";
import type { ProviderSendTurnInput } from "@t3tools/contracts";

/** Provider-only context, appended once to each submitted user message. */
export function formatMessageTime(
  time: NonNullable<ProviderSendTurnInput["messageTime"]>,
  deliveredAt: string,
) {
  const lines = [
    "[T3 message time context, timezone UTC]",
    `User message submitted: ${DateTime.formatIso(DateTime.makeUnsafe(time.submittedAt))}`,
    `Delivered to agent: ${DateTime.formatIso(DateTime.makeUnsafe(deliveredAt))}`,
  ];
  if (time.previousUserMessageAt) {
    lines.push(
      `Previous user message submitted: ${DateTime.formatIso(DateTime.makeUnsafe(time.previousUserMessageAt))}`,
    );
    const seconds = Math.floor(
      (Date.parse(time.submittedAt) - Date.parse(time.previousUserMessageAt)) / 1000,
    );
    if (seconds >= 0) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      lines.push(
        `Elapsed between user submissions: ${days} days, ${hours} hours, ${minutes} minutes, ${seconds % 60} seconds.`,
      );
    } else {
      lines.push("Submission clocks are out of order; elapsed time is unknown.");
    }
  }
  lines.push(
    "These are message timestamps, not dates of events described in the message.",
    "[/T3 message time context]",
  );
  return lines.join("\n");
}
