import { EnvironmentId, ProviderInstanceId, type UsageLimitsSnapshot } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { UsageLimitsMeter } from "./UsageLimitsMeter";

const atomValue = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => atomValue.current }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { usageLimits: () => null },
}));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ render }: { render: ReactNode }) => render,
}));

const environmentId = EnvironmentId.make("environment-1");
const instanceId = ProviderInstanceId.make("claude_work");

describe("UsageLimitsMeter", () => {
  beforeEach(() => {
    atomValue.current = AsyncResult.success({
      providers: [
        {
          provider: "claude",
          instanceId,
          instanceLabel: "Work",
          plan: "Max",
          windows: [
            {
              id: "five_hour",
              label: "5 hour",
              usedPercent: 62,
              resetsAt: "2026-09-04T00:00:00.000Z",
              windowMinutes: 300,
            },
            {
              id: "weekly",
              label: "Weekly",
              usedPercent: 18,
              resetsAt: "2026-09-08T00:00:00.000Z",
              windowMinutes: 10_080,
            },
          ],
          resetCredits: null,
          observedAt: "2026-09-03T18:00:00.000Z",
          readError: null,
        },
        {
          provider: "codex",
          instanceId: ProviderInstanceId.make("codex"),
          instanceLabel: null,
          plan: null,
          windows: [
            {
              id: "other",
              label: "Other account",
              usedPercent: 99,
              resetsAt: null,
              windowMinutes: null,
            },
          ],
          resetCredits: null,
          observedAt: "2026-09-03T18:00:00.000Z",
          readError: null,
        },
      ],
    } satisfies UsageLimitsSnapshot);
  });

  it("shows the selected provider instance and its windows", () => {
    const markup = renderToStaticMarkup(
      <UsageLimitsMeter environmentId={environmentId} instanceId={instanceId} provider="claude" />,
    );

    expect(markup).toContain("Claude Code limits");
    expect(markup).toContain("5 hour");
    expect(markup).toContain("62%");
    expect(markup).toContain(">62%</span></button>");
    expect(markup).toContain("Weekly");
    expect(markup).toContain("18%");
    expect(markup).toContain('aria-label="5 hour usage"');
    expect(markup).not.toContain("Other account");
  });
});
