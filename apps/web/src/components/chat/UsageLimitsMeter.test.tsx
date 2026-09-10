import { EnvironmentId, ProviderInstanceId, type UsageLimitsSnapshot } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { UsageLimitsMeter } from "./UsageLimitsMeter";

const atomValue = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => atomValue.current }));
vi.mock("../../state/server", () => ({ serverEnvironment: { usageLimits: () => null } }));
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
  atomValue.current = AsyncResult.success({
    providers: [
      selected,
      {
        ...selected,
        instanceId: ProviderInstanceId.make("claude_other"),
        plan: "Other account",
        windows: [{ ...selected.windows[0]!, usedPercent: 99 }],
      },
    ],
  } satisfies UsageLimitsSnapshot);
  const renderMeter = () => (
    <UsageLimitsMeter environmentId={environmentId} instanceId={instanceId} provider="claude" />
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
  expect(triggerText).toContain("Overall");
  expect(triggerText).toContain("18%");
  expect(triggerText).toContain("Fable");
  expect(triggerText).toContain("43%");
  expect(text()).toContain("62%");
  expect(text()).toContain("5 hour");
  expect(text()).toContain("Weekly");
  expect(text()).toContain("Resets in");
  expect(text()).toContain("banked");
  expect(text()).not.toContain("Other account");
  expect(text()).not.toContain("99%");

  atomValue.current = AsyncResult.success({
    providers: [
      {
        ...selected,
        windows: [{ ...selected.windows[0]!, usedPercent: 7 }],
        resetCredits: { availableCount: 1, nextExpiresAt: null },
      },
    ],
  } satisfies UsageLimitsSnapshot);
  await act(async () => renderer!.update(renderMeter()));
  expect(text()).toContain("7%");
  expect(text()).not.toContain("62%");
  expect(text()).not.toContain("Weekly");

  atomValue.current = AsyncResult.success({
    providers: [{ ...selected, windows: [], readError: "Refresh failed" }],
  } satisfies UsageLimitsSnapshot);
  await act(async () => renderer!.update(renderMeter()));
  expect(text()).toContain("Could not refresh limits.");
  expect(text()).toContain("Limits unavailable.");
  expect(text()).not.toContain("7%");
});
