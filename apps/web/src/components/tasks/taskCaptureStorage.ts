import { create } from "zustand";
import type { EnvironmentId, WorkItem } from "@t3tools/contracts";

export type TaskCapture = {
  id: string;
  draftKey: string;
  item: WorkItem;
  environmentId: EnvironmentId | null;
  attachmentEnvironmentId?: EnvironmentId;
  files: File[];
  uploaded?: number;
  uploadedAt?: number;
  queued: boolean;
  error?: string | undefined;
};

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("t3code:task-captures", 1);
    request.addEventListener("upgradeneeded", () =>
      request.result.createObjectStore("captures", { keyPath: "id" }),
    );
    request.addEventListener("success", () => {
      request.result.addEventListener("versionchange", () => {
        request.result.close();
        database = undefined;
      });
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      database = undefined;
      reject(request.error);
    });
    request.addEventListener("blocked", () => {
      database = undefined;
      reject(new Error("Close the older T3 tab to enable local task storage."));
    });
  }));
}

export const useTaskCaptures = create<{
  captures: TaskCapture[];
  ready: boolean;
  error: string | null;
}>(() => ({ captures: [], ready: false, error: null }));

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const tx = (await openDatabase()).transaction("captures", mode);
  const request = action(tx.objectStore("captures"));
  await new Promise<void>((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("abort", () =>
      reject(tx.error ?? new Error("Local task save was interrupted.")),
    );
    tx.addEventListener("error", () => reject(tx.error));
  });
  return request.result;
}

export async function reloadTaskCaptures() {
  try {
    const captures: TaskCapture[] = await transaction("readonly", (store) => store.getAll());
    useTaskCaptures.setState({ captures, ready: true, error: null });
  } catch (error) {
    useTaskCaptures.setState({
      ready: true,
      error: error instanceof Error ? error.message : "Local task storage is unavailable.",
    });
  }
}

// Saves are serialized with sync across tabs, so a completed upload cannot erase a newer capture.
export function withTaskCaptureLock<T>(action: () => Promise<T>, id = "all") {
  return navigator.locks.request(`t3-task-captures:${id}`, action);
}

export async function writeTaskCapture(capture: TaskCapture) {
  await transaction("readwrite", (store) => store.put(capture));
  await reloadTaskCaptures();
}

export async function removeTaskCapture(id: string) {
  await transaction("readwrite", (store) => store.delete(id));
  await reloadTaskCaptures();
}

export async function readTaskCaptures(): Promise<TaskCapture[]> {
  return transaction("readonly", (store) => store.getAll());
}

/** Remove local bytes only after the server acknowledges the full task and attachments. */
export async function syncTaskCapture(
  capture: TaskCapture,
  dependencies: {
    upload: (file: File) => Promise<NonNullable<WorkItem["attachments"]>[number]>;
    save: (item: WorkItem) => Promise<unknown>;
    checkpoint: (capture: TaskCapture) => Promise<void>;
    remove: (id: string) => Promise<void>;
  },
) {
  let current = capture;
  // Pending uploads expire after 24 hours. Local originals survive until the task is acknowledged.
  if (current.uploaded && Date.now() - (current.uploadedAt ?? 0) >= 20 * 60 * 60 * 1000) {
    current = {
      ...current,
      uploaded: 0,
      item: {
        ...current.item,
        attachments: current.item.attachments?.slice(0, -current.uploaded) ?? [],
      },
    };
    await dependencies.checkpoint(current);
  }
  while ((current.uploaded ?? 0) < current.files.length) {
    const attachment = await dependencies.upload(current.files[current.uploaded ?? 0]!);
    current = {
      ...current,
      uploaded: (current.uploaded ?? 0) + 1,
      uploadedAt: current.uploadedAt && current.uploaded ? current.uploadedAt : Date.now(),
      item: { ...current.item, attachments: [...(current.item.attachments ?? []), attachment] },
    };
    await dependencies.checkpoint(current);
  }
  await dependencies.save(current.item);
  await dependencies.remove(current.id);
}
