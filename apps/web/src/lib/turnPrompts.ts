import type { OrchestrationMessage } from "@t3tools/contracts";

/**
 * The prompt behind each turn, keyed by turn id. User messages carry no turn id,
 * so a turn's prompt is the last user message before the turn's first reply.
 */
export function turnPrompts(
  messages: ReadonlyArray<Pick<OrchestrationMessage, "role" | "text" | "turnId">>,
): ReadonlyMap<string, string> {
  const prompts = new Map<string, string>();
  let lastUserText: string | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      lastUserText = message.text;
    } else if (message.turnId !== null && lastUserText !== null && !prompts.has(message.turnId)) {
      prompts.set(message.turnId, lastUserText);
    }
  }
  return prompts;
}

/** One line of a prompt for a menu row; the row truncates what is left. */
export function promptPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}
