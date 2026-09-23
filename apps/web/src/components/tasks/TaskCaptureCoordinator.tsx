import { TaskHandoffCoordinator } from "./taskHandoff";
import { useEffect, useRef } from "react";
import { useAtomValue } from "@effect/atom-react";
import { profileSourceAtom } from "../../state/server";
import { useEnvironments } from "../../state/environments";
import { openWorkItem, useSaveWorkItem, useWorkItems } from "../../workItems";
import { toastManager } from "../ui/toast";
import { uploadTaskFile, taskAttachmentUrl } from "./taskAttachments";
import {
  useTaskCaptures,
  reloadTaskCaptures,
  readTaskCaptures,
  writeTaskCapture,
  removeTaskCapture,
  withTaskCaptureLock,
  syncTaskCapture,
} from "./taskCaptureStorage";

export function TaskCaptureCoordinator() {
  const source = useAtomValue(profileSourceAtom);
  const { environments } = useEnvironments();
  const captures = useTaskCaptures((state) => state.captures);
  const save = useSaveWorkItem();
  const working = useRef(false);
  const tasks = useWorkItems();
  const previouslyConnected = useRef(new Set<string>());
  useEffect(() => {
    const connected = new Set(
      environments
        .filter((env) => env.connection.phase === "connected")
        .map((env) => env.environmentId),
    );
    const reconnected = [...connected].filter((id) => !previouslyConnected.current.has(id));
    previouslyConnected.current = connected;
    if (!reconnected.length) return;
    void readTaskCaptures()
      .then(async (pending) => {
        for (const entry of pending) {
          if (!entry.error || !reconnected.includes(entry.environmentId!)) continue;
          await withTaskCaptureLock(async () => {
            const latest = (await readTaskCaptures()).find((capture) => capture.id === entry.id);
            if (latest) await writeTaskCapture({ ...latest, error: undefined });
          }, entry.id);
        }
      })
      .catch((error) => useTaskCaptures.setState({ error: String(error) }));
  }, [environments]);
  useEffect(() => {
    void reloadTaskCaptures();
    const refresh = () => {
      void reloadTaskCaptures();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  useEffect(() => {
    if (working.current || source.conflict) return;
    const available = new Set(
      environments
        .filter(
          (env) =>
            env.connection.phase === "connected" &&
            env.serverConfig?.environment.capabilities.taskCapture,
        )
        .map((env) => env.environmentId),
    );
    if (
      !captures.some(
        (capture) =>
          capture.queued &&
          !capture.error &&
          available.has(capture.environmentId ?? source.sourceId!),
      )
    )
      return;
    working.current = true;
    void (async () => {
      for (const candidate of await readTaskCaptures()) {
        await withTaskCaptureLock(async () => {
          const stored = (await readTaskCaptures()).find((entry) => entry.id === candidate.id);
          if (!stored) return;
          let capture = stored;
          const owner = capture.environmentId ?? source.sourceId;
          if (!capture.queued || capture.error || !owner || !available.has(owner)) return;
          try {
            capture = { ...capture, environmentId: owner };
            await writeTaskCapture(capture);
            const existing = environments
              .find((env) => env.environmentId === owner)
              ?.serverConfig?.settings.workItems?.find((item) => item.id === capture.id);
            if (existing) {
              // The capture id is allocated once. A retry after a lost acknowledgement must not duplicate it.
              if (existing.createdAt !== capture.item.createdAt)
                throw new Error(
                  "A task with this identity already exists. Keep this local copy for recovery.",
                );
              await removeTaskCapture(capture.id);
              return;
            }
            if (
              capture.attachmentEnvironmentId &&
              capture.attachmentEnvironmentId !== owner &&
              capture.item.attachments?.length
            ) {
              const files = await Promise.all(
                capture.item.attachments.map(async (attachment) => {
                  const response = await fetch(
                    await taskAttachmentUrl(capture.attachmentEnvironmentId!, attachment),
                    { signal: AbortSignal.timeout(60_000) },
                  );
                  if (!response.ok)
                    throw new Error(
                      `Could not copy ${attachment.name}. Reconnect its device and retry.`,
                    );
                  return new File([await response.blob()], attachment.name, {
                    type: attachment.mimeType,
                  });
                }),
              );
              capture = {
                ...capture,
                files: [...files, ...capture.files],
                item: { ...capture.item, attachments: [] },
                attachmentEnvironmentId: owner,
              };
              await writeTaskCapture(capture);
            }
            await syncTaskCapture(capture, {
              upload: (file) => uploadTaskFile(owner, file),
              save: (item) => save(owner, item),
              checkpoint: async (next) => {
                capture = next;
                await writeTaskCapture(next);
              },
              remove: removeTaskCapture,
            });
          } catch (error) {
            await writeTaskCapture({
              ...capture,
              error:
                error instanceof Error
                  ? error.message
                  : "Task is saved locally. Reconnect and retry syncing.",
            });
          }
        }, candidate.id);
      }
    })()
      .catch((error) => useTaskCaptures.setState({ error: String(error) }))
      .finally(() => {
        working.current = false;
        void reloadTaskCaptures();
      });
  }, [captures, environments, source.sourceId, source.conflict, save]);

  useEffect(() => {
    const pending = tasks.filter(
      ({ item }) => !item.deletedAt && item.status !== "done" && item.remindAt,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      let next = Infinity;
      for (const task of pending) {
        const at = Date.parse(task.item.remindAt!);
        const key = `t3.task-reminder.${task.environmentId}.${task.item.id}.${at}`;
        if (localStorage.getItem(key)) continue;
        if (at > Date.now()) {
          next = Math.min(next, at);
          continue;
        }
        localStorage.setItem(key, "shown");
        toastManager.add({
          title: task.item.title,
          description: "Task reminder",
          actionProps: { children: "Open task", onClick: () => openWorkItem(task) },
        });
      }
      if (Number.isFinite(next))
        timer = setTimeout(check, Math.min(next - Date.now(), 2_147_483_647));
    };
    check();
    return () => clearTimeout(timer);
  }, [tasks]);
  return <TaskHandoffCoordinator />;
}
