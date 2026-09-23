import { beforeEach, expect, it, vi } from "vite-plus/test";
import { isValidElement } from "react";
import { reactHookHarness as hooks } from "../test/reactHookHarness";
import { visitElements } from "../test/reactElementTree";

const state = vi.hoisted(() => {
  const projects = [
    { id: "pod", environmentId: "laptop", title: "POD", workspaceRoot: "/work/pod" },
    { id: "prasna", environmentId: "laptop", title: "prasna", workspaceRoot: "/work/prasna" },
    { id: "evals", environmentId: "remote", title: "evals", workspaceRoot: "/work/evals" },
  ];
  return {
    projects,
    resolveProject: vi.fn(),
    profiles: [
      {
        id: "work",
        name: "Work",
        projectKeys: projects.map((p) => `${p.environmentId}:${p.id}`),
        spaces: [
          {
            id: "evals",
            name: "Evals",
            threads: [
              { threadKey: "laptop:a", projectKey: "laptop:prasna" },
              { threadKey: "remote:b", projectKey: "remote:evals" },
            ],
          },
          {
            id: "pod",
            name: "POD",
            threads: [{ threadKey: "laptop:c", projectKey: "laptop:pod" }],
          },
          { id: "empty", name: "Empty", threads: [] },
        ],
      },
    ],
  };
});
vi.mock("react", async (original) => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return {
    ...(await original<typeof import("react")>()),
    useState: reactHookHarness.useState,
    useRef: reactHookHarness.useRef,
  };
});
vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});
vi.mock("./spaces/columnNavigation", () => ({ useChatMode: () => ["chat"] }));
vi.mock("../hooks/useOpenChatInColumns", () => ({ useOpenChatInColumns: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../state/entities", () => ({
  useProjects: () => state.projects,
  readProjects: () => state.projects,
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      { environmentId: "laptop", connection: { phase: "connected" } },
      { environmentId: "remote", connection: { phase: "connected" } },
    ],
  }),
}));
vi.mock("../hooks/useSettings", () => ({
  usePrimarySettings: (select: (s: unknown) => unknown) => select({ profiles: state.profiles }),
  useClientSettings: () => ({}),
}));
vi.mock("../hooks/useHandleNewThread", () => ({
  useHandleNewThread: () => ({
    activeThread: null,
    activeDraftThread: null,
    profileProjects: state.projects,
    handleNewThread: vi.fn(),
  }),
}));
vi.mock("../uiStateStore", () => ({
  useUiStateStore: () => ({
    activeProfileId: "work",
    spaceSelection: { profileId: "work", filter: "evals" },
  }),
}));
vi.mock("../composerDraftStore", () => ({ useComposerDraftStore: () => null }));
vi.mock("../chatCreationStore", () => ({
  useChatCreationStore: () => ({}),
  revealChatLocation: vi.fn(),
}));
vi.mock("../hooks/useChatCreation", () => ({
  useResolveChatProject: () => state.resolveProject,
  useSaveProfiles: () => vi.fn(),
}));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../state/server", () => ({ serverEnvironment: {} }));
vi.mock("../logicalProject", () => ({ selectProjectGroupingSettings: vi.fn() }));
vi.mock("./FavoriteSetupPicker", () => ({ FavoriteSetupPicker: () => null }));
vi.mock("./ProjectLocationPicker", () => ({ ProjectLocationPicker: () => null }));
vi.mock("./ui/select", () => ({
  Select: "select",
  SelectTrigger: "label",
  SelectValue: "span",
  SelectPopup: "div",
  SelectItem: "option",
}));
vi.mock("./ui/dialog", () => ({
  Dialog: "div",
  DialogPopup: "div",
  DialogHeader: "header",
  DialogTitle: "h1",
  DialogFooter: "footer",
}));
vi.mock("./ui/button", () => ({ Button: "button" }));
import { ChatCreationDialog } from "./ChatCreationDialog";
import { ProjectLocationPicker } from "./ProjectLocationPicker";

function render() {
  hooks.beginRender();
  const root = ChatCreationDialog();
  if (!isValidElement<{ request: {} }>(root) || typeof root.type !== "function")
    throw new Error("Expected form");
  // The actual form runs with persistent hooks so changes exercise selection state.
  return (root.type as (props: { request: {} }) => ReturnType<typeof ChatCreationDialog>)(
    root.props,
  )!;
}
function picker(tree: ReturnType<typeof render>) {
  return visitElements(tree, (element) => element.type === ProjectLocationPicker)!;
}
beforeEach(() => {
  hooks.reset();
  vi.clearAllMocks();
});
it("prefills a folder from the selected space instead of the first profile folder", () => {
  const tree = render();
  expect(picker(tree).props.value).toEqual({
    environmentId: "laptop",
    workspaceRoot: "/work/prasna",
  });
  const form = visitElements(tree, (element) => element.type === "form")!;
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });
  expect(state.resolveProject).toHaveBeenCalledWith(
    { environmentId: "laptop", workspaceRoot: "/work/prasna" },
    "work",
  );
});
it("offers all space folders across devices and resets when switching spaces", () => {
  let tree = render();
  expect(picker(tree).props.suggestedProjects).toEqual(state.projects.slice(1));
  const spaceSelect = visitElements(
    tree,
    (element) => element.type === "select" && element.props.value === "evals",
  )!;
  (spaceSelect.props.onValueChange as (id: string) => void)("pod");
  tree = render();
  expect(picker(tree).props.value).toEqual({ environmentId: "laptop", workspaceRoot: "/work/pod" });
  expect(picker(tree).props.suggestedProjects).toEqual([state.projects[0]]);
  const nextSelect = visitElements(
    tree,
    (element) => element.type === "select" && element.props.value === "pod",
  )!;
  (nextSelect.props.onValueChange as (id: string) => void)("empty");
  expect(picker(render()).props.value).toBeNull();
});
