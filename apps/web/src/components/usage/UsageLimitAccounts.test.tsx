import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { UsageLimitAccounts } from "./UsageLimitAccounts";

vi.mock("../../hooks/useSettings", () => ({ usePrimarySettings: () => "locale" }));
vi.mock("../../state/server", () => ({ serverEnvironment: {} }));
vi.mock("../../state/presentation", () => ({ environmentPresentations: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipPopup: () => null,
  TooltipTrigger: ({ render, children }: { render: ReactNode; children: ReactNode }) => (
    <>
      {render}
      {children}
    </>
  ),
}));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: () => null,
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
}));

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("shows each window as used and follows a newer account report", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = Date.parse("2026-09-10T12:00:00.000Z");
  const account: ServerProvider = {
    instanceId: ProviderInstanceId.make("claude-work"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Work",
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-10T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: "2026-09-10T12:00:00.000Z",
      windows: [
        { id: "seven_day", kind: "weekly", label: "Overall", usedPercent: 18 },
        { id: "seven_day_fable", kind: "weekly", label: "Fable", usedPercent: 43 },
      ],
    },
  };
  const presentations = new Map([
    [
      EnvironmentId.make("godel"),
      {
        entry: { target: { label: "Godel" } },
        serverConfig: { providers: [account] },
      },
    ],
  ]);
  await act(async () => {
    renderer = create(<UsageLimitAccounts presentations={presentations} now={now} />);
  });
  const labels = () =>
    renderer!.root
      .findAll((node) => node.props.role === "img")
      .map((node) => node.props["aria-label"])
      .filter(Boolean);
  expect(labels()).toContain("Overall: 18% used");
  expect(labels()).toContain("Fable: 43% used");
  presentations.get(EnvironmentId.make("godel"))!.serverConfig.providers = [
    {
      ...account,
      usageLimits: {
        checkedAt: "2026-09-10T12:01:00.000Z",
        windows: [{ id: "seven_day_fable", kind: "weekly", label: "Fable", usedPercent: 7 }],
      },
    },
  ];
  await act(async () =>
    renderer!.update(<UsageLimitAccounts presentations={new Map(presentations)} now={now} />),
  );
  expect(labels()).toContain("Fable: 7% used");
  expect(labels()).not.toContain("Overall: 18% used");
});
