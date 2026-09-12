import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  source: {
    sourceId: "godel" as string | null,
    conflict: false,
    config: { environment: { capabilities: { profileSynchronization: true } } },
  },
  environments: [
    { environmentId: "godel", label: "Godel", connection: { phase: "connected" } },
    { environmentId: "laptop", label: "Laptop", connection: { phase: "connected" } },
  ],
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.source }));
vi.mock("../state/environments", () => ({ useEnvironments: () => state }));
vi.mock("../state/server", () => ({ profileSourceAtom: {}, serverEnvironment: {} }));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: vi.fn() }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: vi.fn() }));

import { useProfilesLoaded, useProfileWriteBlockReason } from "./useProfileSync";

it("explains the profile write restriction and clears it when the source recovers", () => {
  expect(useProfileWriteBlockReason()).toBeNull();
  expect(useProfilesLoaded()).toBe(true);

  state.environments[1]!.connection.phase = "disconnected";
  expect(useProfileWriteBlockReason()).toBeNull();

  state.environments[0]!.connection.phase = "disconnected";
  expect(useProfileWriteBlockReason()).toBe(
    "Connect Godel to save Space changes or open a chat in this Space.",
  );
  expect(useProfilesLoaded()).toBe(false);

  state.source.conflict = true;
  expect(useProfileWriteBlockReason()).toBe(
    "Devices have conflicting profile sources. Choose one in Settings > General > Profiles.",
  );

  state.source.conflict = false;
  state.environments[0]!.connection.phase = "connected";
  state.source.config.environment.capabilities.profileSynchronization = false;
  expect(useProfileWriteBlockReason()).toBe(
    "Update Godel to a version that supports shared profiles.",
  );

  state.source.config.environment.capabilities.profileSynchronization = true;
  expect(useProfileWriteBlockReason()).toBeNull();
  expect(useProfilesLoaded()).toBe(true);
});
