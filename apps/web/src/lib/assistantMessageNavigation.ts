import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";

// Bare message-id navigation for the fork seam link — no quote, so it cannot
// reuse the AssistantCitation hash (that schema requires one). Same shape,
// smaller payload.
const MESSAGE_HASH_PREFIX = "assistant-message=";

export function assistantMessageHash(messageId: MessageId): string {
  return `${MESSAGE_HASH_PREFIX}${encodeURIComponent(messageId)}`;
}

export function assistantMessageIdFromLocation(href: string): MessageId | null {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return null;
  const hash = href.slice(hashIndex + 1);
  if (!hash.startsWith(MESSAGE_HASH_PREFIX)) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(hash.slice(MESSAGE_HASH_PREFIX.length));
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? (trimmed as MessageId) : null;
}

export function assistantMessageNavigation(target: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  messageId: MessageId;
}) {
  return {
    to: "/$environmentId/$threadId" as const,
    params: { environmentId: target.environmentId, threadId: target.threadId },
    hash: assistantMessageHash(target.messageId),
    resetScroll: false,
  };
}
