import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";

/** SDK history includes tool-result user rows; only human prompts define turns. */
export function resolveClaudeRewindTarget(
  messages: ReadonlyArray<SessionMessage>,
  numTurns: number,
) {
  if (!Number.isInteger(numTurns) || numTurns < 1)
    return { error: "Invalid rewind turn count." } as const;
  const prompts = messages.flatMap((entry, index) => {
    if (entry.type !== "user" || entry.parent_tool_use_id) return [];
    const message = entry.message;
    if (!message || typeof message !== "object" || !("content" in message)) return [];
    const content = message.content;
    const human =
      typeof content === "string" ||
      (Array.isArray(content) &&
        content.some(
          (part) =>
            part && typeof part === "object" && (part.type === "text" || part.type === "image"),
        ) &&
        !content.some((part) => part && typeof part === "object" && part.type === "tool_result"));
    return human ? [index] : [];
  });
  const target = prompts.at(-numTurns);
  if (target === undefined)
    return {
      error: "Claude's saved history does not contain the requested prompt. Nothing was rewound.",
    } as const;
  const previous = messages
    .slice(0, target)
    .findLast((entry) => entry.type === "assistant" && !entry.parent_tool_use_id);
  if (target !== prompts[0] && !previous)
    return { error: "The preceding Claude response is missing. Nothing was rewound." } as const;
  return { upToMessageId: previous?.uuid ?? null } as const;
}
