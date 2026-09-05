import { describe, expect, it } from "vite-plus/test";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveClaudeRewindTarget } from "./claudeRewind.ts";

const message = (type: SessionMessage["type"], uuid: string, content: unknown): SessionMessage => ({
  type,
  uuid,
  session_id: "session",
  parent_tool_use_id: null,
  message: { content },
});

describe("Claude native rewind boundary", () => {
  const history = [
    message("user", "first-prompt", "First prompt"),
    message("assistant", "tool-call", [{ type: "tool_use" }]),
    message("user", "tool-result", [{ type: "tool_result", content: "result" }]),
    message("assistant", "first-answer", "First answer"),
    message("user", "second-prompt", [{ type: "image", source: {} }]),
    message("assistant", "second-answer", "Second answer"),
  ];
  it("keeps the preceding completed response, ignoring tool results and sidechains", () => {
    expect(
      resolveClaudeRewindTarget(
        [...history, { ...message("user", "child", "child prompt"), parent_tool_use_id: "tool" }],
        1,
      ),
    ).toEqual({ upToMessageId: "first-answer" });
  });
  it("starts fresh when rewinding the first human prompt", () => {
    expect(resolveClaudeRewindTarget(history, 2)).toEqual({ upToMessageId: null });
  });
  it("refuses missing or invalid boundaries", () => {
    for (const count of [0, -1, 0.5, 3])
      expect(resolveClaudeRewindTarget(history, count)).toHaveProperty("error");
    expect(resolveClaudeRewindTarget([], 1)).toHaveProperty("error");
  });
});
