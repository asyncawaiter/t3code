import { beforeEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_CHAT_BOARD, EnvironmentId, ThreadId } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  mode: "columns",
  router: { state: { location: { href: "/spaces/all?view=columns&workspace=board" } } },
  board: {},
  shell: { projectId: "project", title: "Reference", settledOverride: "settled", archivedAt: null },
  update: vi.fn(async () => true),
  navigate: vi.fn(async () => undefined),
  dashboardReturn: { href: "/dashboard", label: "Global dashboard", threadKey: "device:reference" },
}));
vi.mock("./useSettings", () => ({
  usePrimarySettings: () => [
    {
      id: "work",
      projectKeys: ["device:project"],
      spaces: [
        { id: "pod", threads: [{ threadKey: "device:reference", projectKey: "device:project" }] },
      ],
    },
  ],
}));
vi.mock("./useChatBoards", () => ({
  useChatBoards: () => ({ board: state.board, update: state.update }),
}));
vi.mock("../state/entities", () => ({ readThreadShell: () => state.shell }));
vi.mock("../components/spaces/columnNavigation", async (original) => ({
  ...(await original<typeof import("../components/spaces/columnNavigation")>()),
  useChatMode: () => [state.mode],
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useRouter: () => state.router,
  useLocation: ({
    select,
  }: {
    select: (location: { state: { dashboardReturn: typeof state.dashboardReturn } }) => unknown;
  }) => select({ state: { dashboardReturn: state.dashboardReturn } }),
}));
import { useOpenChatInColumns } from "./useOpenChatInColumns";
const chat = { environmentId: EnvironmentId.make("device"), id: ThreadId.make("reference") };
beforeEach(() => {
  state.mode = "columns";
  state.router.state.location.href = "/spaces/all?view=columns&workspace=board";
  state.board = { ...DEFAULT_CHAT_BOARD, order: ["other:chat"], widths: { "other:chat": 570 } };
  state.update.mockReset().mockResolvedValue(true);
  state.navigate.mockClear();
});
it("opens a settled search result without unsetting it or replacing the mixed board", async () => {
  expect(await useOpenChatInColumns()(chat)).toBe(true);
  expect(state.update).toHaveBeenCalledWith(
    expect.objectContaining({
      order: ["other:chat", "device:reference"],
      kept: ["device:reference"],
      widths: { "other:chat": 570 },
      labels: { "device:reference": { title: "Reference", context: "" } },
    }),
  );
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      search: { view: "columns", space: undefined, unsorted: false, focus: "device:reference" },
      state: { dashboardReturn: state.dashboardReturn },
    }),
  );
});
it("leaves navigation and the board alone in Chat mode", async () => {
  state.mode = "chat";
  expect(await useOpenChatInColumns()(chat)).toBe(false);
  expect(state.update).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("does not navigate or lose the board when saving fails", async () => {
  state.update.mockResolvedValue(false);
  await expect(useOpenChatInColumns()(chat)).rejects.toThrow("Could not save");
  expect(state.navigate).not.toHaveBeenCalled();
});
it("focuses an existing reference without rewriting its order or width", async () => {
  state.board = {
    ...DEFAULT_CHAT_BOARD,
    order: ["device:reference", "other:chat"],
    kept: ["device:reference"],
  };
  expect(await useOpenChatInColumns()(chat)).toBe(true);
  expect(state.update).not.toHaveBeenCalled();
  expect(state.navigate).toHaveBeenCalledOnce();
});

it("does not pull the user back after they leave while the board saves", async () => {
  state.update.mockImplementationOnce(async () => {
    state.router.state.location.href = "/usage";
    return true;
  });
  expect(await useOpenChatInColumns()(chat)).toBe(true);
  expect(state.navigate).not.toHaveBeenCalled();
});

it("opens a scoped dashboard conversation without changing any saved board", async () => {
  state.router.state.location.href = "/spaces/work?space=pod&unsorted=false";
  expect(await useOpenChatInColumns()(chat)).toBe(true);
  expect(state.update).not.toHaveBeenCalled();
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { profileId: "work" },
      search: {
        view: "columns",
        workspace: "space",
        space: "pod",
        unsorted: false,
        focus: "device:reference",
      },
    }),
  );
});
it("opens global dashboard conversations in the live all-chats workspace", async () => {
  state.router.state.location.href = "/dashboard";
  expect(await useOpenChatInColumns()(chat)).toBe(true);
  expect(state.update).not.toHaveBeenCalled();
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { profileId: "all" },
      search: expect.objectContaining({ workspace: "space" }),
    }),
  );
});
