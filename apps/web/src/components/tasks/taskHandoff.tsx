import { requestOlderThreadTurns } from "@t3tools/client-runtime/state/threads";
import { useEffect, useRef } from "react";
import * as Option from "effect/Option";
import {
  type EnvironmentId,
  type ThreadId,
  type TaskDraftRef,
  type WorkItemHandoff,
  workItemPrompt,
  recordWorkItemHandoff,
  confirmWorkItemHandoff,
} from "@t3tools/contracts";
import { useComposerDraftStore, composerDraftHasUserContent } from "../../composerDraftStore";
import { useSaveWorkItem, useWorkItems, type LocatedWorkItem } from "../../workItems";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentServerConfigsAtom } from "../../state/server";
import { useEnvironmentThread } from "../../state/threads";
import { taskAttachmentUrl } from "./taskAttachments";
import { randomUUID } from "../../lib/utils";

export async function prepareTaskDraft(
  task: LocatedWorkItem,
  target: { environmentId: EnvironmentId; threadId: ThreadId },
) {
  const store = useComposerDraftStore.getState();
  const existing = store.getComposerDraft(target);
  if (
    existing?.taskRefs?.some(
      (ref) => ref.environmentId === task.environmentId && ref.taskId === task.item.id,
    ) &&
    composerDraftHasUserContent(existing)
  )
    return;
  if (composerDraftHasUserContent(existing))
    throw new Error(
      "This chat already has a draft. Send or clear it before handing off this task.",
    );
  const files = await Promise.all(
    (task.item.attachments ?? []).map(async (attachment) => {
      const response = await fetch(await taskAttachmentUrl(task.environmentId, attachment), {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Could not load ${attachment.name}.`);
      return {
        attachment,
        file: new File([await response.blob()], attachment.name, { type: attachment.mimeType }),
      };
    }),
  );
  if (composerDraftHasUserContent(store.getComposerDraft(target)))
    throw new Error("Your draft changed. Send or clear it before handing off this task.");
  store.setPrompt(target, workItemPrompt(task.item));
  for (const { attachment, file } of files) {
    const id = randomUUID();
    if (attachment.type === "image")
      store.addImage(target, {
        ...attachment,
        type: "image",
        id,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    else
      store.addFiles(target, [
        {
          type: "file",
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          id,
          file,
        },
      ]);
  }
  store.setTaskRefs(target, [{ environmentId: task.environmentId, taskId: task.item.id }]);
}

/** Save the exact message identity before dispatch so reconnect can recover a lost acknowledgement. */
export function useRegisterTaskHandoffs() {
  const save = useSaveWorkItem();
  return async (
    refs: readonly TaskDraftRef[],
    handoffs: readonly WorkItemHandoff[],
    accepted = false,
  ) => {
    for (const ref of refs) {
      const task = appAtomRegistry
        .get(environmentServerConfigsAtom)
        .get(ref.environmentId)
        ?.settings.workItems?.find((item) => item.id === ref.taskId);
      if (!task)
        throw new Error("Reconnect the task's storage device before sending this handoff.");
      const next = handoffs.reduce(
        (item, handoff) =>
          accepted
            ? confirmWorkItemHandoff(item, handoff, handoff.createdAt)
            : recordWorkItemHandoff(item, handoff),
        task,
      );
      const saved = await save(ref.environmentId, next, task);
      if (
        !handoffs.every((handoff) =>
          saved.handoffs?.some(
            (entry) =>
              entry.messageId === handoff.messageId &&
              entry.environmentId === handoff.environmentId,
          ),
        )
      )
        throw new Error("Update the task's storage device before sending this handoff.");
    }
  };
}

export function TaskHandoffCoordinator() {
  const tasks = useWorkItems();
  return (
    <>
      {tasks
        .filter(({ item }) => !item.deletedAt)
        .flatMap((task) =>
          (task.item.handoffs ?? [])
            .filter((handoff) => !handoff.sentAt && !handoff.cancelledAt)
            .map((handoff) => (
              <PendingHandoff
                key={`${task.environmentId}:${task.item.id}:${handoff.messageId}`}
                task={task}
                handoff={handoff}
              />
            )),
        )}
    </>
  );
}

function PendingHandoff({ task, handoff }: { task: LocatedWorkItem; handoff: WorkItemHandoff }) {
  const state = useEnvironmentThread(handoff.environmentId, handoff.threadId);
  const save = useSaveWorkItem();
  const saving = useRef(false);
  const message = Option.isSome(state.data)
    ? state.data.value.messages.find(
        (entry) => entry.id === handoff.messageId && entry.role === "user",
      )
    : undefined;
  useEffect(() => {
    if (
      message ||
      state.status !== "live" ||
      Option.isNone(state.data) ||
      Option.isNone(state.page)
    )
      return;
    const oldest = state.data.value.messages[0];
    if (
      state.page.value.hasMore &&
      !state.page.value.loadingOlder &&
      (!oldest || oldest.createdAt > handoff.createdAt)
    )
      requestOlderThreadTurns(handoff.environmentId, handoff.threadId);
  }, [message, state, handoff]);
  useEffect(() => {
    if (!message || state.status !== "live" || saving.current) return;
    saving.current = true;
    void save(
      task.environmentId,
      confirmWorkItemHandoff(task.item, handoff, message.createdAt),
      task.item,
    )
      .catch(() => {
        /* A reconnect or newer task snapshot retries this durable handoff. */
      })
      .finally(() => {
        saving.current = false;
      });
  }, [message, state.status, task, handoff, save]);
  return null;
}
