import { create } from "zustand";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { EnvironmentId, type WorkItem } from "@t3tools/contracts";
import { useTaskCaptures } from "./components/tasks/taskCaptureStorage";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { environmentServerConfigsAtom, serverEnvironment } from "./state/server";
import { useAtomCommand } from "./state/use-atom-command";
import { appAtomRegistry } from "./rpc/atomRegistry";

export type LocatedWorkItem = {
  environmentId: EnvironmentId;
  item: WorkItem;
  localCaptureId?: string;
  localDraft?: boolean;
  syncError?: string;
};
export type WorkItemRequest = Partial<LocatedWorkItem> & {
  source?: WorkItem["source"];
  title?: string;
  notes?: string;
  attachments?: WorkItem["attachments"];
  profileId?: string | null;
  spaceId?: string | null;
  projectId?: WorkItem["projectId"];
  files?: File[];
};
export function workItemDraftKey(request: WorkItemRequest) {
  if (request.item) return request.item.id;
  if (request.source) return `${request.source.environmentId}:${request.source.threadId}`;
  return request.profileId !== undefined
    ? JSON.stringify(["space", request.profileId, request.spaceId ?? null])
    : "new";
}

export const useWorkItemEditor = create<{ request: WorkItemRequest | null }>(() => ({
  request: null,
}));
export function openWorkItem(request: WorkItemRequest = {}) {
  useWorkItemEditor.setState({ request });
}

export function useWorkItems() {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const captures = useTaskCaptures((state) => state.captures);
  return useMemo(() => {
    const saved = [...configs].flatMap(([environmentId, config]) =>
      (config.settings.workItems ?? []).map((item) => ({ environmentId, item })),
    );
    return [
      ...saved,
      ...captures
        .filter(
          (capture) =>
            (capture.queued ||
              capture.item.notes.trim() ||
              capture.files.length ||
              capture.item.attachments?.length) &&
            !saved.some(
              (entry) =>
                entry.environmentId === capture.environmentId && entry.item.id === capture.id,
            ),
        )
        .map((capture) => ({
          environmentId: capture.environmentId ?? EnvironmentId.make("local-task-capture"),
          item: capture.item,
          localCaptureId: capture.id,
          localDraft: !capture.queued,
          ...(capture.error ? { syncError: capture.error } : {}),
        })),
    ];
  }, [configs, captures]);
}

export function useSaveWorkItem() {
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  return async (environmentId: EnvironmentId, item: WorkItem, base?: WorkItem) => {
    if (
      !appAtomRegistry.get(environmentServerConfigsAtom).get(environmentId)?.environment
        .capabilities.taskCapture
    )
      throw new Error("Update this device before saving tasks to it.");
    const result = await update({
      environmentId,
      input: {
        patch: { workItems: [item] },
        baseWorkItems: base ? [base] : [],
      },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    return result.value.workItems?.find((saved) => saved.id === item.id) ?? item;
  };
}
