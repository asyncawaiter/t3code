import { expect, it } from "vite-plus/test";
import { syncTaskCapture, type TaskCapture } from "./taskCaptureStorage";

it("retains screenshot bytes through failed sync and resumes without repeating acknowledged uploads", async () => {
  const file = new File(["screenshot bytes"], "request.png", { type: "image/png" });
  let capture: TaskCapture = {
    id: "capture",
    draftKey: "space",
    environmentId: null,
    queued: true,
    files: [file],
    item: {
      id: "capture",
      title: "Screenshot",
      notes: "",
      brief: "",
      status: "parked",
      profileId: null,
      spaceId: null,
      projectId: null,
      threadId: null,
      source: null,
      links: [],
      createdAt: "2026-09-22T12:00:00.000Z",
      updatedAt: "2026-09-22T12:00:00.000Z",
    },
  };
  let uploads = 0,
    removed = false;
  const dependencies = {
    upload: async () => {
      uploads++;
      return {
        id: "attachment",
        type: "image" as const,
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      };
    },
    checkpoint: async (next: TaskCapture) => {
      capture = next;
    },
    save: async () => {
      throw new Error("Disconnected");
    },
    remove: async () => {
      removed = true;
    },
  };
  await expect(syncTaskCapture(capture, dependencies)).rejects.toThrow("Disconnected");
  expect(removed).toBe(false);
  expect(await capture.files[0]!.text()).toBe("screenshot bytes");
  expect(capture.item.attachments).toHaveLength(1);
  await syncTaskCapture(capture, {
    ...dependencies,
    save: async (item) => {
      expect(item.attachments).toHaveLength(1);
    },
  });
  expect(uploads).toBe(1);
  expect(removed).toBe(true);
  const expired = { ...capture, uploadedAt: 1 };
  await syncTaskCapture(expired, {
    ...dependencies,
    save: async (item) => {
      expect(item.attachments).toHaveLength(1);
    },
  });
  expect(uploads).toBe(2);
});
