import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  sourceAtom: {},
  editsAtom: {},
  source: {
    sourceId: "godel" as string | null,
    conflict: false,
    profiles: [{ id: "work" }],
    config: { environment: { capabilities: { profileSynchronization: true } } },
  },
  edits: { loaded: true, error: null as string | null },
  environments: [{ environmentId: "godel", label: "Godel", connection: { phase: "connected" } }],
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) => (atom === state.editsAtom ? state.edits : state.source),
}));
vi.mock("../state/profileEdits", () => ({ profileEditsAtom: state.editsAtom, profileEdits: {} }));
vi.mock("../state/environments", () => ({ useEnvironments: () => state }));
vi.mock("../state/server", () => ({ profileSourceAtom: state.sourceAtom, serverEnvironment: {} }));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: vi.fn() }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: vi.fn() }));

import {
  useProfilesLoaded,
  useProfileWriteBlockReason,
  useProfileSyncConnection,
} from "./useProfileSync";

it("keeps organization editable when the source is offline, incompatible or conflicted", () => {
  expect(useProfilesLoaded()).toBe(true);
  expect(useProfileSyncConnection()).toBe(true);
  state.environments[0]!.connection.phase = "disconnected";
  expect(useProfileWriteBlockReason()).toBeNull();
  expect(useProfileSyncConnection()).toBe(false);
  state.environments[0]!.connection.phase = "connected";
  state.source.config.environment.capabilities.profileSynchronization = false;
  expect(useProfilesLoaded()).toBe(true);
  expect(useProfileSyncConnection()).toBe(false);
  state.source.config.environment.capabilities.profileSynchronization = true;
  state.source.conflict = true;
  expect(useProfilesLoaded()).toBe(true);
  expect(useProfileSyncConnection()).toBe(false);
  state.source.conflict = false;
  expect(useProfileSyncConnection()).toBe(true);
});

it("waits for durable local edits to load instead of overwriting them", () => {
  state.edits.loaded = false;
  state.edits.error = "Could not read local edits";
  expect(useProfileWriteBlockReason()).toBe(state.edits.error);
  state.edits.loaded = true;
  state.edits.error = null;
  expect(useProfileWriteBlockReason()).toBeNull();
});
