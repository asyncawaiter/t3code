// @effect-diagnostics nodeBuiltinImport:off - bounded JSONL streaming and globbing form this native filesystem boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import type { OrchestrationThreadActivity, ServerSettings } from "@t3tools/contracts";
import type { ProviderRuntimeBinding } from "./Services/ProviderSessionDirectory.ts";
import { expandHomePath } from "../pathExpansion.ts";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Only explicit provider summary records qualify, never ordinary assistant text. */
export async function readCompactionSummary(
  lines: AsyncIterable<string>,
  input: { provider: string; createdAt: string; boundaryId?: string },
): Promise<string | null> {
  const matches: string[] = [];
  let matchingBoundary = false;
  const nearby = (value: unknown) =>
    typeof value === "string" && Math.abs(Date.parse(value) - Date.parse(input.createdAt)) <= 5000;
  for await (const line of lines) {
    let row: Record<string, unknown>;
    try {
      row = record(JSON.parse(line));
    } catch {
      continue;
    }
    if (input.provider === "codex") {
      if (row.type !== "compacted" || !nearby(row.timestamp)) continue;
      const summary = string(record(row.payload).message);
      if (summary) matches.push(summary);
    } else if (input.provider === "claudeAgent") {
      if (row.type === "system" && row.subtype === "compact_boundary") {
        matchingBoundary = input.boundaryId ? row.uuid === input.boundaryId : nearby(row.timestamp);
      }
      if (row.isCompactSummary !== true || !matchingBoundary) continue;
      const content = record(row.message).content;
      const summary =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((part) => record(part).type === "text")
                .map((part) => string(record(part).text) ?? "")
                .join("\n")
            : "";
      if (summary) matches.push(summary);
      matchingBoundary = false;
    }
  }
  // Do not guess when multiple records could belong to the same marker.
  return matches.length === 1 && matches[0]!.length <= 2_000_000 ? matches[0]! : null;
}

/** Read on the owning host. Cache only exact recovered output, never an unavailable result. */
export async function getCompactionOutput(input: {
  threadId: string;
  activity: OrchestrationThreadActivity;
  binding?: ProviderRuntimeBinding;
  settings: ServerSettings;
  stateDir: string;
  environment: Readonly<Record<string, string | undefined>>;
}) {
  const payload = record(input.activity.payload);
  const detail = record(payload.detail);
  const provider = string(payload.provider) ?? input.binding?.provider;
  const instanceId = string(payload.providerInstanceId) ?? input.binding?.providerInstanceId;
  const metadata = {
    device: NodeOS.hostname(),
    createdAt: input.activity.createdAt,
    ...(provider ? { provider } : {}),
    ...(typeof payload.beforeTokens === "number" ? { beforeTokens: payload.beforeTokens } : {}),
    ...(typeof payload.afterTokens === "number" ? { afterTokens: payload.afterTokens } : {}),
  };
  const unavailable = {
    ...metadata,
    summary: null,
    reason:
      "This provider did not expose the compaction summary, or its saved transcript is no longer available.",
  };
  const key = NodeCrypto.createHash("sha256")
    .update(`${input.threadId}\0${input.activity.id}`)
    .digest("hex");
  const cache = NodePath.join(input.stateDir, "compaction-output", `${key}.txt`);
  try {
    return { ...metadata, summary: await NodeFSP.readFile(cache, "utf8") };
  } catch (error) {
    if (record(error).code !== "ENOENT") throw error;
  }
  if (provider !== "codex" && provider !== "claudeAgent") return unavailable;
  const sameBinding =
    provider === input.binding?.provider && instanceId === input.binding?.providerInstanceId;
  const cursor = sameBinding ? record(input.binding?.resumeCursor) : {};
  const sessionId =
    string(detail.session_id) ?? string(provider === "codex" ? cursor.threadId : cursor.resume);
  // Session ids, not caller-supplied paths, select the only transcript we inspect.
  if (!sessionId || !/^[a-zA-Z0-9_-]{1,160}$/.test(sessionId)) return unavailable;
  const instance = Object.entries(input.settings.providerInstances).find(
    ([id]) => id === instanceId,
  )?.[1];
  if (instance && instance.driver !== provider) return unavailable;
  if (!instance && instanceId && instanceId !== provider) return unavailable;
  const config = record(instance?.config ?? input.settings.providers[provider]);
  const variable = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
  const configuredHome = string(config.homePath)?.trim();
  const environmentHome =
    instance?.environment?.findLast((entry) => entry.name === variable)?.value ??
    input.environment[variable];
  const home = NodePath.resolve(
    expandHomePath(
      configuredHome ||
        (provider === "codex" && string(config.shadowHomePath)?.trim()
          ? undefined
          : environmentHome) ||
        NodePath.join(NodeOS.homedir(), provider === "codex" ? ".codex" : ".claude"),
    ),
  );
  const patterns =
    provider === "codex"
      ? [`sessions/*/*/*/*-${sessionId}.jsonl`, `archived_sessions/*-${sessionId}.jsonl`]
      : [`projects/*/${sessionId}.jsonl`];
  let summary: string | null = null;
  for await (const file of NodeFSP.glob(patterns, { cwd: home })) {
    // ponytail: cap each transcript read at 256 MiB; index compaction offsets if larger sessions need support.
    const stream = NodeFS.createReadStream(NodePath.join(home, file), {
      end: 256 * 1024 * 1024 - 1,
    });
    const lines = NodeReadline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      const found = await readCompactionSummary(lines, {
        provider,
        createdAt: input.activity.createdAt,
        ...(string(detail.uuid) ? { boundaryId: string(detail.uuid)! } : {}),
      });
      if (found) {
        if (summary !== null && summary !== found) return unavailable;
        summary = found;
      }
    } finally {
      lines.close();
      stream.destroy();
    }
  }
  if (!summary) return unavailable;
  await NodeFSP.mkdir(NodePath.join(input.stateDir, "compaction-output"), { recursive: true });
  const temporary = `${cache}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.writeFile(temporary, summary, { mode: 0o600 });
  await NodeFSP.rename(temporary, cache);
  return { ...metadata, summary };
}
