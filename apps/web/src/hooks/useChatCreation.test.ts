import { beforeEach, expect, it, vi } from "vite-plus/test";
import * as Cause from "effect/Cause";
import { ALL_PROFILE_ID, EnvironmentId } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  browse: vi.fn(),
  create: vi.fn(),
  waitForProject: vi.fn(),
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "remote",
        label: "Work laptop",
        connection: { phase: "connected" },
        serverConfig: { environment: { platform: { os: "linux" } } },
      },
    ],
  }),
}));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => state.browse }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => state.create }));
vi.mock("../state/filesystem", () => ({ filesystemEnvironment: { browse: {} } }));
vi.mock("../state/projects", () => ({ projectEnvironment: { create: {} } }));
vi.mock("../state/entities", () => ({
  readProjects: () => [],
  waitForProject: state.waitForProject,
}));
vi.mock("../state/server", () => ({ primaryServerSettingsAtom: {} }));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: { get: () => ({ profiles: [] }) } }));
vi.mock("./useProfileSync", () => ({ useSaveProfiles: () => vi.fn() }));
vi.mock("../localApi", () => ({ readLocalApi: () => undefined }));

import { useResolveChatProject } from "./useChatCreation";

beforeEach(() => {
  vi.clearAllMocks();
  state.browse.mockResolvedValue({
    _tag: "Success",
    value: { parentPath: "/home/work", entries: [] },
  });
  state.create.mockResolvedValue({ _tag: "Success" });
});

it("creates a new folder on the chosen device using its freshly resolved parent", async () => {
  const result = await useResolveChatProject()(
    {
      environmentId: EnvironmentId.make("remote"),
      workspaceRoot: "~/App",
      newFolder: { parentPath: "~/", name: "App" },
    },
    ALL_PROFILE_ID,
  );
  expect(state.browse).toHaveBeenCalledWith({
    environmentId: "remote",
    input: { partialPath: "~/" },
  });
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      environmentId: "remote",
      input: expect.objectContaining({
        workspaceRoot: "/home/work/App",
        createWorkspaceRootIfMissing: true,
      }),
    }),
  );
  expect(result.workspaceRoot).toBe("/home/work/App");
  expect(result.deviceLabel).toBe("Work laptop");
});

it("never creates a directory for an ordinary existing-folder selection", async () => {
  await useResolveChatProject()(
    { environmentId: EnvironmentId.make("remote"), workspaceRoot: "/home/work" },
    ALL_PROFILE_ID,
  );
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ createWorkspaceRootIfMissing: false }),
    }),
  );
});

it("does not create a folder after its parent disappears", async () => {
  state.browse.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(new Error("Parent unavailable")),
  });
  await expect(
    useResolveChatProject()(
      {
        environmentId: EnvironmentId.make("remote"),
        workspaceRoot: "/gone/App",
        newFolder: { parentPath: "/gone", name: "App" },
      },
      ALL_PROFILE_ID,
    ),
  ).rejects.toThrow("Parent unavailable");
  expect(state.create).not.toHaveBeenCalled();
});

it("surfaces creation failures without waiting for or opening a nonexistent project", async () => {
  state.create.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(new Error("Permission denied")),
  });
  await expect(
    useResolveChatProject()(
      {
        environmentId: EnvironmentId.make("remote"),
        workspaceRoot: "/home/work/App",
        newFolder: { parentPath: "/home/work", name: "App" },
      },
      ALL_PROFILE_ID,
    ),
  ).rejects.toThrow("Permission denied");
  expect(state.waitForProject).not.toHaveBeenCalled();
});
