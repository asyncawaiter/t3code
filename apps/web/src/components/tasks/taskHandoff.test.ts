import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId, type WorkItem } from "@t3tools/contracts";
import { useComposerDraftStore } from "../../composerDraftStore";

vi.mock("../../workItems", () => ({ useSaveWorkItem: vi.fn(), useWorkItems: vi.fn() }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../../state/server", () => ({ environmentServerConfigsAtom: {} }));
vi.mock("../../state/threads", () => ({ useEnvironmentThread: vi.fn() }));
vi.mock("./taskAttachments", () => ({
  taskAttachmentUrl: async () => "http://localhost/test-attachment",
}));
import { prepareTaskDraft } from "./taskHandoff";

const environmentId = EnvironmentId.make("storage");
const target = { environmentId: EnvironmentId.make("execution"), threadId: ThreadId.make("work") };
const item: WorkItem = {
  id: "task",
  title: "Review request",
  notes: "Original request",
  brief: "Prepared context",
  status: "parked",
  profileId: null,
  spaceId: null,
  projectId: null,
  source: null,
  threadId: null,
  links: ["https://example.com/request"],
  createdAt: "2026-09-22T12:00:00.000Z",
  updatedAt: "2026-09-22T12:00:00.000Z",
};
beforeEach(() => useComposerDraftStore.setState({ draftsByThreadKey: {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  useComposerDraftStore.setState({ draftsByThreadKey: {} });
});

it("preserves request, brief, source links and file bytes, and resumes an edited task draft", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("attachment content")),
  );
  const task = {
    environmentId,
    item: {
      ...item,
      attachments: [
        {
          type: "file" as const,
          id: "attachment",
          name: "request.txt",
          mimeType: "text/plain",
          sizeBytes: 18,
        },
      ],
    },
  };
  await prepareTaskDraft(task, target);
  const draft = useComposerDraftStore.getState().getComposerDraft(target)!;
  expect(draft.prompt).toContain("Original request");
  expect(draft.prompt).toContain("Prepared context");
  expect(draft.prompt).toContain(item.links[0]);
  expect(await draft.files[0]?.file?.text()).toBe("attachment content");
  expect(draft.taskRefs).toEqual([{ environmentId, taskId: item.id }]);
  useComposerDraftStore.getState().setPrompt(target, "Edited before sending");
  await prepareTaskDraft(task, target);
  expect(useComposerDraftStore.getState().getComposerDraft(target)?.prompt).toBe(
    "Edited before sending",
  );
});

it("never overwrites another draft, including edits made while attachments download", async () => {
  const store = useComposerDraftStore.getState();
  store.setPrompt(target, "Unrelated draft");
  await expect(prepareTaskDraft({ environmentId, item }, target)).rejects.toThrow(
    "already has a draft",
  );
  store.clearComposerContent(target);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      store.setPrompt(target, "Newer edit");
      return new Response("file");
    }),
  );
  await expect(
    prepareTaskDraft(
      {
        environmentId,
        item: {
          ...item,
          attachments: [
            { type: "file", id: "file", name: "request.txt", mimeType: "text/plain", sizeBytes: 4 },
          ],
        },
      },
      target,
    ),
  ).rejects.toThrow("draft changed");
  expect(store.getComposerDraft(target)?.prompt).toBe("Newer edit");
});
