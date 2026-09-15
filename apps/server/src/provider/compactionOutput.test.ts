// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import {
  DEFAULT_SERVER_SETTINGS,
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { getCompactionOutput, readCompactionSummary } from "./compactionOutput.ts";

async function* lines(rows: unknown[]) {
  for (const row of rows) yield typeof row === "string" ? row : JSON.stringify(row);
}
const createdAt = "2026-09-14T12:00:00Z";

describe("compaction output", () => {
  it("selects the exact Claude boundary across multiple compactions", async () => {
    const rows = [
      { type: "system", subtype: "compact_boundary", uuid: "old" },
      { isCompactSummary: true, message: { content: "Old summary" } },
      { type: "system", subtype: "compact_boundary", uuid: "wanted" },
      "malformed",
      { type: "assistant", message: { content: "Do not use ordinary assistant text" } },
      {
        isCompactSummary: true,
        message: {
          content: [
            { type: "text", text: "## Saved" },
            { type: "text", text: "Exact summary" },
          ],
        },
      },
    ];
    expect(
      await readCompactionSummary(lines(rows), {
        provider: "claudeAgent",
        createdAt,
        boundaryId: "wanted",
      }),
    ).toBe("## Saved\nExact summary");
    expect(
      await readCompactionSummary(lines(rows), {
        provider: "claudeAgent",
        createdAt,
        boundaryId: "missing",
      }),
    ).toBeNull();
  });
  it("reads only explicit Codex compaction output and refuses ambiguous matches", async () => {
    const row = { type: "compacted", timestamp: createdAt, payload: { message: "Saved context" } };
    expect(
      await readCompactionSummary(lines([{ ...row, timestamp: "2026-09-13T12:00:00Z" }, row]), {
        provider: "codex",
        createdAt,
      }),
    ).toBe("Saved context");
    expect(
      await readCompactionSummary(lines([row, row]), { provider: "codex", createdAt }),
    ).toBeNull();
    expect(
      await readCompactionSummary(lines([{ ...row, payload: { encrypted_content: "secret" } }]), {
        provider: "codex",
        createdAt,
      }),
    ).toBeNull();
  });
  it("uses the event's account home and preserves recovered output after transcript removal", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-compaction-"));
    try {
      const transcriptDir = NodePath.join(root, "account", "projects", "project");
      await NodeFSP.mkdir(transcriptDir, { recursive: true });
      const transcript = NodePath.join(transcriptDir, "session-id.jsonl");
      await NodeFSP.writeFile(
        transcript,
        [
          { type: "system", subtype: "compact_boundary", uuid: "boundary" },
          { isCompactSummary: true, message: { content: "Account-specific summary" } },
        ]
          .map((row) => JSON.stringify(row))
          .join("\n"),
      );
      const instanceId = ProviderInstanceId.make("work");
      const input = {
        threadId: "thread",
        stateDir: NodePath.join(root, "state"),
        environment: {},
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          providerInstances: {
            [instanceId]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: NodePath.join(root, "account") },
            },
          },
        },
        activity: {
          id: EventId.make("event"),
          kind: "context-compaction",
          createdAt,
          tone: "info" as const,
          summary: "Context compacted",
          turnId: null,
          payload: {
            provider: "claudeAgent",
            providerInstanceId: instanceId,
            detail: { session_id: "session-id", uuid: "boundary" },
          },
        },
      };
      expect((await getCompactionOutput(input)).summary).toBe("Account-specific summary");
      await NodeFSP.rm(transcript);
      expect((await getCompactionOutput(input)).summary).toBe("Account-specific summary");
      expect(
        (
          await getCompactionOutput({
            ...input,
            activity: { ...input.activity, id: EventId.make("missing") },
          })
        ).summary,
      ).toBeNull();
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
});
