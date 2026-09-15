import {
  EnvironmentId,
  ProviderInstanceId,
  type UsageLimitsSnapshot,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { UsageLimitsMeter } from "./UsageLimitsMeter";

vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => refreshProviders }));
const refreshProviders = vi.fn();
vi.mock("../../hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: {} } }));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ render }: { render: ReactNode }) => render,
}));

const environmentId = EnvironmentId.make("environment-1");
const instanceId = ProviderInstanceId.make("claude_work");
let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("keeps the account meter and detailed reset popup current as the selected account updates", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { visibilityState: "visible" });
  const selected = {
    provider: "claude",
    instanceId,
    instanceLabel: "Work",
    plan: "Max",
    windows: [
      {
        id: "five_hour",
        label: "5 hour",
        usedPercent: 62,
        resetsAt: "2026-09-11T00:00:00.000Z",
        windowMinutes: 300,
      },
      {
        id: "seven_day",
        label: "Weekly",
        usedPercent: 18,
        resetsAt: "2026-09-15T00:00:00.000Z",
        windowMinutes: 10_080,
      },
      {
        id: "seven_day_fable",
        label: "Weekly Fable",
        usedPercent: 43,
        resetsAt: "2026-09-15T00:00:00.000Z",
        windowMinutes: 10_080,
      },
    ],
    resetCredits: { availableCount: 2, nextExpiresAt: null },
    observedAt: "2026-09-10T18:00:00.000Z",
    readError: null,
  } satisfies UsageLimitsSnapshot["providers"][number];
  const toSnapshot = (
    limits: UsageLimitsSnapshot["providers"][number],
  ): ServerProviderUsageLimits => ({
    checkedAt: limits.observedAt,
    windows: limits.windows.map((window) => ({
      id: window.id,
      label: window.label,
      kind: "other",
      usedPercent: window.usedPercent,
      ...(window.resetsAt ? { resetsAt: window.resetsAt } : {}),
      ...(window.windowMinutes !== null ? { windowDurationMins: window.windowMinutes } : {}),
    })),
    ...(limits.resetCredits
      ? { resetCredits: { availableCount: limits.resetCredits.availableCount } }
      : {}),
    ...(limits.readError ? { unavailable: { reason: "probeFailed" } } : {}),
  });
  let snapshot = toSnapshot(selected);
  const renderMeter = () => (
    <UsageLimitsMeter
      environmentId={environmentId}
      instanceId={instanceId}
      provider="claude"
      snapshot={snapshot}
      plan="Max"
    />
  );
  await act(async () => {
    renderer = create(renderMeter());
  });
  const text = () =>
    renderer!.root
      .findAllByType("span")
      .flatMap((node) => node.children.filter((child) => typeof child === "string"))
      .join(" ");
  const triggerText = renderer!.root
    .findByType("button")
    .findAllByType("span")
    .flatMap((node) => node.children.filter((child) => typeof child === "string"))
    .join(" ");
  expect(triggerText).not.toContain("Overall");
  expect(triggerText).toContain("18%");
  expect(triggerText).not.toContain("Fable");
  expect(triggerText).toContain("43%");
  expect(text()).toContain("62%");
  expect(text()).toContain("5 hour");
  expect(text()).toContain("Weekly");
  expect(text()).toContain("Resets in");
  expect(text()).toContain("banked");
  expect(text()).not.toContain("Other account");
  expect(text()).not.toContain("99%");

  snapshot = toSnapshot({
    ...selected,
    windows: [{ ...selected.windows[0]!, usedPercent: 7 }],
    resetCredits: { availableCount: 1, nextExpiresAt: null },
  });
  await act(async () => renderer!.update(renderMeter()));
  expect(text()).toContain("7%");
  expect(text()).not.toContain("62%");
  expect(text()).not.toContain("Weekly");

  snapshot = toSnapshot({ ...selected, windows: [], readError: "Refresh failed" });
  await act(async () => renderer!.update(renderMeter()));
  expect(text()).toContain("Could not refresh limits.");
  expect(text()).toContain("Limits unavailable.");
  expect(text()).not.toContain("7%");
});
