import { beforeEach, expect, it, vi } from "vite-plus/test";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const state = vi.hoisted(() => ({
  thread: null as null | {
    id: string;
    projectId: string;
    environmentId: string;
    archivedAt: string | null;
  },
  connected: true,
  bootstrapped: true,
  bookmark: "device:chat",
  archive: vi.fn(),
  open: vi.fn(),
  notice: vi.fn(),
  navigate: vi.fn(),
  close: vi.fn(),
  router: { state: { location: { href: "/dashboard" } } },
}));
vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useRouter: () => state.router,
  useLocation: () => undefined,
}));
vi.mock("./useOpenChatInColumns", () => ({ useOpenChatInColumns: () => state.open }));
vi.mock("../components/ui/toast", () => ({
  toastManager: { add: state.notice, close: state.close },
}));
vi.mock("../state/entities", () => ({
  readThreadShell: () => state.thread,
  useAllEnvironmentShellsBootstrapped: () => state.bootstrapped,
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "device",
        label: "Laptop",
        connection: { phase: state.connected ? "connected" : "disconnected" },
      },
    ],
  }),
}));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => state.archive }));
vi.mock("../state/orchestration", () => ({
  orchestrationEnvironment: { archivedShellSnapshot: {} },
}));
vi.mock("./useSettings", () => ({ usePrimarySettings: () => [] }));
vi.mock("../workflowState", () => ({ useWorkflowState: { getState: () => ({ visit: vi.fn() }) } }));
vi.mock("../uiStateStore", () => ({
  selectSidebarSpace: () => ({}),
  useUiStateStore: {
    getState: () => ({ bookmarkedThreadKey: state.bookmark, setActiveProfileId: vi.fn() }),
    setState: (next: { bookmarkedThreadKey?: string }) => {
      if (typeof next !== "function" && "bookmarkedThreadKey" in next)
        state.bookmark = next.bookmarkedThreadKey!;
    },
  },
}));
import { useWorkflowNavigation } from "./useWorkflowNavigation";
beforeEach(() => {
  vi.clearAllMocks();
  state.connected = true;
  state.bootstrapped = true;
  state.bookmark = "device:chat";
  state.thread = null;
  state.archive.mockResolvedValue({ _tag: "Success", value: { threads: [] } });
  state.open.mockResolvedValue(true);
});
it("keeps offline bookmarks and offers Connections without claiming deletion", () => {
  state.connected = false;
  useWorkflowNavigation()("device:chat");
  expect(state.archive).not.toHaveBeenCalled();
  expect(state.open).not.toHaveBeenCalled();
  expect(state.notice).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Laptop is offline",
      actionProps: expect.objectContaining({ children: "Connections" }),
    }),
  );
  expect(state.bookmark).toBe("device:chat");
});
it("waits for the initial snapshot before treating a bookmark as missing", () => {
  state.bootstrapped = false;
  useWorkflowNavigation()("device:chat");
  expect(state.archive).not.toHaveBeenCalled();
  expect(state.notice).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Chats are still loading" }),
  );
});
it("opens an archived bookmark as a reference with its original project context", async () => {
  const opened = deferred<unknown>();
  state.archive.mockResolvedValue({
    _tag: "Success",
    value: { threads: [{ id: "chat", projectId: "project", archivedAt: "2026-09-23" }] },
  });
  state.open.mockImplementation((chat) => {
    opened.resolve(chat);
    return Promise.resolve(true);
  });
  useWorkflowNavigation()("device:chat");
  expect(await opened.promise).toEqual({
    id: "chat",
    projectId: "project",
    environmentId: "device",
    archivedAt: "2026-09-23",
  });
  expect(state.bookmark).toBe("device:chat");
});
it("offers removal only after the connected device has no active or archived chat", async () => {
  const missing = deferred<{ actionProps: { onClick: () => void } }>();
  state.notice.mockImplementation((notice) => {
    if (notice.title === "Chat not found") missing.resolve(notice);
    return "notice";
  });
  useWorkflowNavigation()("device:chat");
  const notice = await missing.promise;
  expect(state.open).not.toHaveBeenCalled();
  expect(state.bookmark).toBe("device:chat");
  notice.actionProps.onClick();
  expect(state.bookmark).toBeNull();
});
it("does not offer removal when checking the archive fails", async () => {
  const failed = deferred<unknown>();
  state.archive.mockResolvedValue({ _tag: "Failure" });
  state.notice.mockImplementation((notice) => {
    if (notice.title === "Could not check archived chats") failed.resolve(notice);
    return "notice";
  });
  useWorkflowNavigation()("device:chat");
  expect(await failed.promise).toMatchObject({ actionProps: { children: "Connections" } });
  expect(state.bookmark).toBe("device:chat");
});
