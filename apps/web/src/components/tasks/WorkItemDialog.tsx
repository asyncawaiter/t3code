import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { assistantMessageHash } from "../../lib/assistantMessageNavigation";
import { MessageId } from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { uploadTaskFile, taskAttachmentUrl } from "./taskAttachments";
import { taskFolders } from "@t3tools/client-runtime/state/profiles";
import { randomUUID } from "../../lib/utils";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandId,
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ThreadId,
  WorkItem,
  moveThreadsToSpace,
  profileForProject,
  indexProfileSpaces,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { shouldHandleComposerAttachmentPaste } from "../chat/composerAttachmentFiles";
import { ExpandedImageDialog } from "../chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "../chat/ExpandedImagePreview";
import type { ChatAttachment } from "@t3tools/contracts";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import {
  PaperclipIcon,
  ExternalLinkIcon,
  FolderIcon,
  FileIcon,
  XIcon,
  ChevronDownIcon,
  MessageSquareIcon,
} from "lucide-react";
import {
  useWorkItemEditor,
  useWorkItems,
  useSaveWorkItem,
  type WorkItemRequest,
  workItemDraftKey,
} from "../../workItems";
import { useEnvironments } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { usePrimarySettings } from "../../hooks/useSettings";
import { useUiStateStore } from "../../uiStateStore";
import { environmentServerConfigsAtom } from "../../state/server";
import { useSaveProfiles } from "../../hooks/useProfileSync";
import { threadEnvironment } from "../../state/threads";
import { vcsEnvironment } from "../../state/vcs";
import { useAtomCommand } from "../../state/use-atom-command";

const Draft = Schema.NullOr(
  Schema.Struct({
    task: Schema.Struct({ ...WorkItem.fields, title: Schema.String }),
    base: Schema.optionalKey(WorkItem),
    device: Schema.NullOr(EnvironmentId),
    separate: Schema.optionalKey(Schema.Boolean),
  }),
);
const decodeStatus = Schema.decodeUnknownSync(WorkItem.fields.status);
const decodeTask = Schema.decodeUnknownSync(WorkItem);

export function WorkItemDialog() {
  const request = useWorkItemEditor((state) => state.request);
  return request ? <TaskForm key={request.item?.id ?? "new"} request={request} /> : null;
}

function TaskForm({ request }: { request: WorkItemRequest }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<ExpandedImagePreview | null>(null);
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const projects = useProjects();
  const threads = useThreadShells();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const ui = useUiStateStore();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const draftKey = workItemDraftKey(request);
  const [draft, setDraft] = useLocalStorage(`t3.task-draft.${draftKey}`, null, Draft);
  const sourcePlacement = request.source
    ? indexProfileSpaces(profiles).get(`${request.source.environmentId}:${request.source.threadId}`)
    : undefined;
  const sourceProfile =
    sourcePlacement?.profile ??
    (request.projectId && request.environmentId
      ? profileForProject(profiles, `${request.environmentId}:${request.projectId}`)
      : undefined);
  const [device, setDevice] = useState(
    draft?.device ??
      request.environmentId ??
      environments.find(
        (env) =>
          env.connection.phase === "connected" &&
          env.serverConfig?.environment.capabilities.workItems,
      )?.environmentId ??
      null,
  );
  const [base, setBase] = useState(draft?.base ?? request.item);
  const [task, setTask] = useState<WorkItem>(
    () =>
      draft?.task ??
      request.item ?? {
        id: randomUUID(),
        title: request.title ?? "",
        notes: request.notes ?? "",
        attachments: request.attachments ?? [],
        brief: "",
        status: "parked",
        profileId:
          request.profileId !== undefined
            ? request.profileId === "all"
              ? null
              : request.profileId
            : request.source
              ? (sourceProfile?.id ?? null)
              : ui.activeProfileId,
        spaceId:
          request.spaceId !== undefined
            ? request.spaceId
            : (sourcePlacement?.space.id ??
              (request.source
                ? null
                : ui.spaceSelection?.filter && ui.spaceSelection.filter !== OUTSIDE_SPACES
                  ? ui.spaceSelection.filter
                  : null)),
        projectId: request.projectId ?? null,
        source: request.source ?? null,
        threadId: null,
        links: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [separate, setSeparate] = useState(draft?.separate ?? false);
  const allTasks = useWorkItems();
  const live = allTasks.find(
    (entry) => entry.environmentId === device && entry.item.id === task.id,
  )?.item;
  useEffect(() => {
    if (live && base && Equal.equals(task, base) && !Equal.equals(live, base)) {
      // Refresh a pristine form when a remote agent saves its handoff brief.
      // eslint-disable-next-line react/set-state-in-effect
      setTask(live);
      setBase(live);
    }
  }, [live, base, task]);
  useEffect(() => {
    if (!Equal.equals(task, base) || separate)
      setDraft({ task, ...(base ? { base } : {}), device, separate });
  }, [task, base, device, separate, setDraft]);
  const save = useSaveWorkItem();
  const saveProfiles = useSaveProfiles();
  const create = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const listRefs = useAtomQueryRunner(vcsEnvironment.readRefs, {
    reportFailure: false,
    refresh: true,
  });
  const createWorktree = useAtomCommand(vcsEnvironment.createWorktree, { reportFailure: false });
  const profile = profiles.find((item) => item.id === task.profileId);
  const folders = taskFolders(projects, device, profile, task.spaceId);
  const project = (task.threadId ? projects : folders).find(
    (folder) => folder.environmentId === device && folder.id === task.projectId,
  );
  const linked = threads.find(
    (thread) =>
      thread.environmentId === device && thread.id === (task.threadId ?? `task-${task.id}`),
  );
  const connected = environments.some(
    (env) => env.environmentId === device && env.connection.phase === "connected",
  );
  const change = (patch: Partial<WorkItem>) => setTask((current) => ({ ...current, ...patch }));
  const close = () => useWorkItemEditor.setState({ request: null });

  async function persist(next = task) {
    if (!device) throw new Error("Choose a device to store this task.");
    const validated = decodeTask({
      ...next,
      projectId: next.threadId
        ? next.projectId
        : (folders.find((folder) => folder.id === next.projectId)?.id ?? null),
      title: next.title.trim(),
      links: next.links.map((link) => link.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    });
    const saved = await save(device, validated, base);
    setBase(saved);
    setTask(saved);
    setDraft(separate ? { task: saved, base: saved, device, separate } : null);
    return saved;
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) {
      setError("Wait for the current action to finish, then try again.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this task.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    await run(async () => {
      if (!device || !connected)
        throw new Error("Choose a connected device to attach screenshots or files.");
      if ((task.attachments?.length ?? 0) + files.length > 8)
        throw new Error("Attach up to 8 files.");
      const attachments = [...(task.attachments ?? [])];
      for (const file of files) {
        attachments.push(await uploadTaskFile(device, file));
        change({ attachments: [...attachments] });
      }
      if (task.title.trim()) await persist({ ...task, attachments });
    });
  }
  async function openChat() {
    if (!device || !project) throw new Error("Choose the folder where this work belongs.");
    let saved = await persist();
    const threadId = saved.threadId ?? ThreadId.make(`task-${saved.id}`);
    if (!linked) {
      if (saved.threadId)
        throw new Error(
          "The linked chat is unavailable. Restore it or unlink it before preparing another chat.",
        );
      const modelSelection =
        project.defaultModelSelection ??
        configs.get(device)?.settings.defaultModelSelection ??
        threads.find((thread) => thread.environmentId === device)?.modelSelection;
      if (!modelSelection)
        throw new Error("Choose a default model for this folder in Settings first.");
      let worktreePath: string | null = null;
      let branch: string | null = null;
      if (separate) {
        const refs = await listRefs({
          environmentId: device,
          input: {
            cwd: project.workspaceRoot,
            includeGraph: true,
            graphCommitLimit: 1,
            refresh: true,
          },
        });
        if (refs._tag === "Failure") throw squashAtomCommandFailure(refs);
        const existing = refs.value.graph?.worktrees.find(
          (item) => item.branch === `task/${saved.id}`,
        );
        if (existing) {
          worktreePath = existing.path;
          branch = existing.branch;
        } else {
          const result = await createWorktree({
            environmentId: device,
            input: {
              cwd: project.workspaceRoot,
              refName: "HEAD",
              newRefName: `task/${saved.id}`,
              path: null,
            },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          worktreePath = result.value.worktree.path;
          branch = result.value.worktree.refName;
        }
      }
      const result = await create({
        environmentId: device,
        input: {
          commandId: CommandId.make(`task-create-${saved.id}`),
          threadId,
          projectId: project.id,
          title: saved.title,
          modelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: "default",
          branch,
          worktreePath,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    }
    saved = await save(
      device,
      {
        ...saved,
        threadId,
        status: saved.status === "parked" ? "ready" : saved.status,
        updatedAt: new Date().toISOString(),
      },
      saved,
    );
    setBase(saved);
    setTask(saved);
    setDraft(null);
    if (saved.profileId)
      await saveProfiles((current) =>
        current.map((owner) =>
          owner.id === saved.profileId
            ? moveThreadsToSpace(
                {
                  ...owner,
                  projectKeys: [...new Set([...owner.projectKeys, `${device}:${project.id}`])],
                },
                [{ threadKey: `${device}:${threadId}`, projectKey: `${device}:${project.id}` }],
                saved.spaceId,
              )
            : owner,
        ),
      );
    close();
    await navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: device, threadId },
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup
        className="max-w-lg overflow-hidden"
        showCloseButton={!busy}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (
            !shouldHandleComposerAttachmentPaste({
              files,
              plainText: event.clipboardData.getData("text/plain"),
            })
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          void addFiles(files);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          event.stopPropagation();
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5">
          <DialogTitle className="font-sans text-base">
            {base ? "Task details" : task.source ? "Create task from this chat" : "New task"}
          </DialogTitle>
          {!base && (
            <p className="text-xs text-muted-foreground">
              {task.source
                ? "Saves a separate task with a link to the source chat. Nothing is added to that chat."
                : "Save work for later. A chat is optional."}
            </p>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
              Outcome
              <Input
                autoFocus
                aria-label="Task title"
                placeholder="What needs doing?"
                maxLength={240}
                className="font-medium text-foreground"
                value={task.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
              Request and context
              <Textarea
                aria-label="Task notes"
                className="[&_textarea]:min-h-24 [&_textarea]:max-h-40 [&_textarea]:resize-y [&_textarea]:font-normal"
                maxLength={32000}
                placeholder="A thought, a call, or a request to return to..."
                value={task.notes}
                onChange={(e) => change({ notes: e.target.value })}
              />
            </label>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Paste screenshots here or drop files into this form.
              {busy ? " Attaching or saving..." : ""}
            </p>
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <TaskSelect
                  label="Profile"
                  ariaLabel="Task profile"
                  value={task.profileId ?? ""}
                  onChange={(value) =>
                    change({
                      profileId: value || null,
                      spaceId: null,
                      projectId: task.threadId ? task.projectId : null,
                    })
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...profiles.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
                <TaskSelect
                  label="Space"
                  ariaLabel="Task space"
                  value={task.spaceId ?? ""}
                  disabled={!profile}
                  onChange={(value) =>
                    change({
                      spaceId: value || null,
                      projectId: task.threadId ? task.projectId : null,
                    })
                  }
                  options={[
                    { value: "", label: "Unsorted" },
                    ...(profile?.spaces ?? []).map((space) => ({
                      value: space.id,
                      label: space.name,
                    })),
                  ]}
                />
                <TaskSelect
                  label="Device"
                  ariaLabel="Task device"
                  value={device ?? ""}
                  disabled={!!base || !!task.attachments?.length}
                  onChange={(value) => {
                    setDevice(EnvironmentId.make(value));
                    change({ projectId: null });
                  }}
                  options={[
                    { value: "", label: "Choose device", disabled: true },
                    ...environments.map((env) => ({
                      value: env.environmentId,
                      label: env.label,
                      detail: env.connection.phase !== "connected" ? "Offline" : undefined,
                    })),
                  ]}
                />
                <TaskSelect
                  label="Folder"
                  ariaLabel="Task folder"
                  value={project?.id ?? ""}
                  disabled={!!task.threadId}
                  onChange={(value) => change({ projectId: value ? ProjectId.make(value) : null })}
                  options={[
                    { value: "", label: "Choose later" },
                    ...(task.threadId && project ? [project] : folders).map((folder) => ({
                      value: folder.id,
                      label: folder.title,
                      detail: folder.workspaceRoot,
                    })),
                  ]}
                />
              </div>
              {project && (
                <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <FolderIcon className="mt-0.5 size-3 shrink-0" />
                  <span className="break-all font-mono">{project.workspaceRoot}</span>
                </p>
              )}
            </div>
            <details
              open={!!task.links.length || !!task.attachments?.length || !!task.source}
              className="group rounded-lg border border-border/60"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                <PaperclipIcon className="size-3.5 text-muted-foreground" />
                Sources and files
                <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-border/50 p-3">
                <Textarea
                  aria-label="Task source links"
                  size="sm"
                  className="[&_textarea]:max-h-28 [&_textarea]:font-normal"
                  placeholder="Slack, Google Chat, issues, documents. One link per line."
                  value={task.links.join("\n")}
                  onChange={(e) => change({ links: e.target.value.split("\n") })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    aria-label="Task attachment files"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      void addFiles(files);
                    }}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!device || !connected || (task.attachments?.length ?? 0) >= 8}
                    onClick={() => fileInput.current?.click()}
                  >
                    <PaperclipIcon className="size-3" />
                    Attach files
                  </Button>
                  {task.source && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        close();
                        void navigate({
                          to: "/$environmentId/$threadId",
                          params: task.source!,
                          ...(task.source?.messageId
                            ? { hash: assistantMessageHash(MessageId.make(task.source.messageId)) }
                            : {}),
                        });
                      }}
                    >
                      <ExternalLinkIcon className="size-3" />
                      Source chat
                    </Button>
                  )}
                </div>
                {task.attachments?.length ? (
                  <ul className="space-y-1">
                    {task.attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1"
                      >
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:underline"
                          onClick={() =>
                            void run(async () => {
                              if (device) {
                                const url = await taskAttachmentUrl(device, attachment);
                                if (attachment.type === "image")
                                  setPreview({
                                    images: [{ src: url, name: attachment.name }],
                                    index: 0,
                                  });
                                else {
                                  const link = document.createElement("a");
                                  link.href = url;
                                  link.download = attachment.name;
                                  link.click();
                                }
                              }
                            })
                          }
                        >
                          {device && attachment.type === "image" ? (
                            <TaskImage environmentId={device} attachment={attachment} />
                          ) : (
                            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{attachment.name}</span>
                        </button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Remove ${attachment.name}`}
                          onClick={() =>
                            change({
                              attachments:
                                task.attachments?.filter((file) => file.id !== attachment.id) ?? [],
                            })
                          }
                        >
                          <XIcon className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
            <details
              open={!!task.brief || !!task.threadId || !!task.preparation}
              className="group rounded-lg border border-border/60"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                <MessageSquareIcon className="size-3.5 text-muted-foreground" />
                Chat preparation
                <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-border/50 p-3">
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                  Handoff brief
                  <Textarea
                    aria-label="Handoff brief"
                    className="[&_textarea]:min-h-20 [&_textarea]:max-h-40 [&_textarea]:font-normal"
                    maxLength={32000}
                    placeholder="Outcome, decisions, relevant files, questions, and first step."
                    value={task.brief}
                    onChange={(e) => change({ brief: e.target.value })}
                  />
                </label>
                {(task.source || task.threadId) && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={task.preparation?.state === "running" || !connected}
                    onClick={() =>
                      void run(async () => {
                        if (task.source && task.source.environmentId !== device)
                          throw new Error(
                            "Save this task on the source chat's device to prepare it there.",
                          );
                        await persist({
                          ...task,
                          preparation:
                            task.preparation?.state === "queued"
                              ? null
                              : { requestedAt: new Date().toISOString(), state: "queued" },
                        });
                      })
                    }
                  >
                    {task.preparation?.state === "queued"
                      ? "Cancel preparation"
                      : task.preparation?.state === "running"
                        ? "Preparing brief..."
                        : "Prepare brief with agent"}
                  </Button>
                )}
                {task.preparation && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {task.preparation.state === "queued"
                      ? "Queued after the current turn. You can cancel until it starts."
                      : task.preparation.state === "running"
                        ? "Preparing in the source chat. Review the brief before starting work."
                        : task.preparation.error}
                  </p>
                )}
                {project && (
                  <TaskSelect
                    label={task.threadId ? "Linked chat" : "Link an existing chat"}
                    ariaLabel={task.threadId ? "Linked chat" : "Link existing chat"}
                    value={task.threadId ?? ""}
                    onChange={(value) => change({ threadId: value ? ThreadId.make(value) : null })}
                    options={[
                      { value: "", label: task.threadId ? "Unlink chat" : "Create a new chat" },
                      ...threads
                        .filter((t) => t.environmentId === device && t.projectId === task.projectId)
                        .map((t) => ({ value: t.id, label: t.title })),
                    ]}
                  />
                )}
                {!task.threadId && (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={separate} onCheckedChange={setSeparate} />
                    Use a separate worktree
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!task.title.trim() || !project || !connected}
                    onClick={() => void run(openChat)}
                  >
                    {task.threadId ? "Open chat" : "Save & create new chat"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {project
                      ? "Nothing starts until you send."
                      : "Choose a folder to prepare a chat."}
                  </span>
                </div>
              </div>
            </details>
            <div className="w-36">
              <TaskSelect
                label="Status"
                ariaLabel="Task status"
                value={task.status}
                onChange={(value) => change({ status: decodeStatus(value) })}
                options={[
                  { value: "parked", label: "Parked" },
                  { value: "ready", label: "Ready" },
                  { value: "working", label: "Working" },
                  { value: "done", label: "Done" },
                ]}
              />
            </div>
            {!connected && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reconnect this device to save. Your draft stays on this device.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
              >
                {error}
              </p>
            )}
          </fieldset>
        </div>
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 px-5 py-3 sm:justify-between">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="text-muted-foreground"
            onClick={() => {
              setDraft(null);
              close();
            }}
          >
            Discard draft
          </Button>
          <Button
            size="sm"
            disabled={busy || !task.title.trim() || !connected}
            onClick={() =>
              void run(async () => {
                await persist();
                close();
              })
            }
          >
            {busy ? "Saving..." : "Save task"}
          </Button>
        </DialogFooter>
      </DialogPopup>
      {preview && <ExpandedImageDialog preview={preview} onClose={() => setPreview(null)} />}
    </Dialog>
  );
}

function TaskSelect({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  options: { value: string; label: string; detail?: string | undefined; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={ariaLabel} className="w-full min-w-0 font-normal">
          <SelectValue>
            {options.find((item) => item.value === value)?.label ?? "Unavailable"}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup
          alignItemWithTrigger={false}
          className="max-h-64"
          popupClassName="max-w-[min(28rem,calc(100vw-2rem))]"
        >
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              <span className="block truncate">{item.label}</span>
              {item.detail && (
                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </label>
  );
}

function TaskImage({
  environmentId,
  attachment,
}: {
  environmentId: EnvironmentId;
  attachment: ChatAttachment;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void taskAttachmentUrl(environmentId, attachment)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [environmentId, attachment]);
  return url ? (
    <img
      src={url}
      alt="Screenshot attachment"
      className="size-10 shrink-0 rounded border border-border/50 object-cover"
    />
  ) : (
    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
  );
}
