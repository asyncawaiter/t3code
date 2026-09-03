import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  claudeConfigDir,
  makeClaudeAccountLimitsReader,
  normalizeClaudeUsage,
  tierLabel,
} from "./claudeAccountLimits.ts";

describe("normalizeClaudeUsage", () => {
  it("reads the structured limits array, naming scoped weekly buckets after their model", () => {
    expect(
      normalizeClaudeUsage(
        {
          limits: [
            { kind: "session", percent: 40, resets_at: "2026-09-03T09:40:00+00:00", scope: null },
            {
              kind: "weekly_all",
              percent: 18,
              resets_at: "2026-09-08T11:00:00+00:00",
              scope: null,
            },
            {
              kind: "weekly_scoped",
              percent: 36,
              resets_at: "2026-09-08T11:00:00+00:00",
              scope: { model: { display_name: "Fable" }, surface: null },
            },
          ],
          five_hour: { utilization: 99, resets_at: null },
          extra_usage: { is_enabled: true, utilization: 12 },
        },
        "Max 20x",
      ),
    ).toEqual({
      complete: true,
      plan: "Max 20x",
      windows: [
        {
          id: "five_hour",
          label: "5 hour",
          usedPercent: 40,
          resetsAt: "2026-09-03T09:40:00+00:00",
          windowMinutes: 300,
        },
        {
          id: "seven_day",
          label: "Weekly",
          usedPercent: 18,
          resetsAt: "2026-09-08T11:00:00+00:00",
          windowMinutes: 10080,
        },
        {
          id: "seven_day_fable",
          label: "Weekly Fable",
          usedPercent: 36,
          resetsAt: "2026-09-08T11:00:00+00:00",
          windowMinutes: 10080,
        },
        {
          id: "overage",
          label: "Extra usage",
          usedPercent: 12,
          resetsAt: null,
          windowMinutes: null,
        },
      ],
    });
  });

  it("falls back to the named top-level windows without a limits array", () => {
    expect(
      normalizeClaudeUsage(
        {
          five_hour: { utilization: 31, resets_at: "2026-09-03T09:40:00+00:00" },
          seven_day_opus: null,
          seven_day_sonnet: { utilization: null, resets_at: null },
        },
        "Pro",
      ).windows.map((window) => [window.id, window.usedPercent]),
    ).toEqual([["five_hour", 31]]);
  });

  it("derives the tier from the rate limit tier before the subscription type", () => {
    expect(tierLabel("max", "default_claude_max_20x")).toBe("Max 20x");
    expect(tierLabel("max", "default_claude_max_5x")).toBe("Max 5x");
    expect(tierLabel("pro", null)).toBe("Pro");
    expect(tierLabel(null, null)).toBeNull();
  });

  it("resolves the credentials directory the way the CLI would for this instance", () => {
    const join = (...parts: string[]) => parts.join("/");
    expect(
      claudeConfigDir({
        environment: { CLAUDE_CONFIG_DIR: "/work/claude-config" },
        homePath: "",
        resolvedHome: "/home/me",
        join,
      }),
    ).toBe("/work/claude-config");
    // The driver hands a configured home to the CLI as CLAUDE_CONFIG_DIR, so it wins.
    expect(
      claudeConfigDir({
        environment: { CLAUDE_CONFIG_DIR: "/work/claude-config" },
        homePath: "~/.claude_work",
        resolvedHome: "/home/me/.claude_work",
        join,
      }),
    ).toBe("/home/me/.claude_work");
    expect(
      claudeConfigDir({
        environment: {},
        homePath: "~/.claude_work",
        resolvedHome: "/home/me/.claude_work",
        join,
      }),
    ).toBe("/home/me/.claude_work");
    expect(
      claudeConfigDir({
        environment: { HOME: "/srv/other" },
        homePath: "",
        resolvedHome: "/home/me",
        join,
      }),
    ).toBe("/srv/other/.claude");
    expect(
      claudeConfigDir({ environment: undefined, homePath: "", resolvedHome: "/home/me", join }),
    ).toBe("/home/me/.claude");
  });
});

describe("makeClaudeAccountLimitsReader", () => {
  it.effect("falls back to the macOS keychain when no credentials file exists", () =>
    Effect.gen(function* () {
      const spawned: Array<unknown> = [];
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.sync(() => {
          spawned.push(command);
          return ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(1),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            unref: Effect.succeed(Effect.void),
            stdin: Sink.drain,
            stdout: Stream.encodeText(
              Stream.make('{"claudeAiOauth":{"accessToken":"tok","subscriptionType":"max"}}'),
            ),
            stderr: Stream.empty,
            all: Stream.empty,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
          });
        }),
      );
      const authorizations: Array<string | undefined> = [];
      const httpClient = HttpClient.make((request) =>
        Effect.sync(() => {
          authorizations.push(request.headers.authorization);
          return HttpClientResponse.fromWeb(
            request,
            new Response('{"five_hour":{"utilization":12,"resets_at":"2026-09-03T09:40:00Z"}}', {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }),
      );
      const result = yield* makeClaudeAccountLimitsReader({
        settings: { homePath: "" },
        environment: { HOME: "/nonexistent/claude-home" },
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        httpClient,
        spawner,
        platform: "darwin",
      });
      expect(spawned).toHaveLength(1);
      expect(authorizations).toEqual(["Bearer tok"]);
      expect(result).not.toBeNull();
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
