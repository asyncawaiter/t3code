import * as DateTime from "effect/DateTime";
import type { ProviderSendTurnInput } from "@t3tools/contracts";

/** Format each instant with its own DST offset, using the sending client's zone. */
export function messageTimeFormatter(timeZone = "UTC"): {
  timeZone: string;
  format: (value: string) => string;
} {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
    return {
      timeZone: formatter.resolvedOptions().timeZone,
      format: (value: string) => {
        if (formatter.resolvedOptions().timeZone === "UTC") {
          return DateTime.formatIso(DateTime.makeUnsafe(value));
        }
        const parts = Object.fromEntries(
          formatter.formatToParts(Date.parse(value)).map((part) => [part.type, part.value]),
        );
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${parts.timeZoneName?.replace("GMT", "") || "+00:00"}`;
      },
    };
  } catch {
    return messageTimeFormatter("UTC");
  }
}

/** Provider-only context, appended once to each submitted user message. */
export function formatMessageTime(
  time: NonNullable<ProviderSendTurnInput["messageTime"]>,
  deliveredAt: string,
) {
  const clock = messageTimeFormatter(time.timeZone);
  const lines = [
    `[T3 message time context, timezone ${clock.timeZone}]`,
    `User message submitted: ${clock.format(time.submittedAt)}`,
    `Delivered to agent: ${clock.format(deliveredAt)}`,
  ];
  if (time.previousUserMessageAt) {
    lines.push(`Previous user message submitted: ${clock.format(time.previousUserMessageAt)}`);
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
