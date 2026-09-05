import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { useAtomValue } from "@effect/atom-react";
import { useRef, useState } from "react";
import { PlusIcon, ArrowRightIcon, MonitorIcon, Settings2Icon } from "lucide-react";
import type { EnvironmentId, Profile, ProfileSpace, ScopedProjectRef } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createModelSelection } from "@t3tools/shared/model";
import { useEnvironmentQuery } from "../../state/query";
import { filesystemEnvironment } from "../../state/filesystem";
import { useProjects } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
  isProviderInstancePickerReady,
} from "../../providerInstances";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle } from "../ui/popover";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { cn } from "../../lib/utils";

type Defaults = NonNullable<ProfileSpace["newChatDefaults"]>;

function LaunchModel({
  environmentId,
  selection,
  onChange,
}: {
  environmentId: EnvironmentId;
  selection: Defaults["modelSelection"];
  onChange: (selection: Defaults["modelSelection"]) => void;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  );
  const resolved = resolveDefaultProviderModelSelection(providers, selection ?? null);
  const options = getCustomModelOptionsByInstance(
    settings,
    providers,
    resolved?.instanceId ?? null,
    resolved?.model ?? null,
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span>Provider and model</span>
        {selection && (
          <Button size="xs" variant="ghost" onClick={() => onChange(undefined)}>
            Use project default
          </Button>
        )}
      </div>
      {!selection && (
        <p className="text-[11px] text-muted-foreground">Following project defaults</p>
      )}
      {resolved ? (
        <ProviderModelPicker
          activeInstanceId={resolved.instanceId}
          model={resolved.model}
          lockedProvider={null}
          instanceEntries={entries}
          modelOptionsByInstance={options}
          triggerVariant="outline"
          triggerClassName="w-full justify-between"
          onInstanceModelChange={(instanceId, model) =>
            onChange(createModelSelection(instanceId, model))
          }
        />
      ) : (
        <p className="text-xs text-muted-foreground">No providers available on this device.</p>
      )}
    </div>
  );
}

export function SpaceLaunch({
  profile,
  space,
  selected,
  disabled,
  onChange,
  onLaunch,
  open,
  onOpenChange,
  startInSettings,
}: {
  profile: Profile;
  space: ProfileSpace;
  selected: boolean;
  disabled: boolean;
  onChange: (profile: Profile) => void;
  onLaunch: (project: ScopedProjectRef, defaults: Defaults) => Promise<void>;
  open: boolean;
  startInSettings: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Defaults | undefined>(space.newChatDefaults);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDraft(space.newChatDefaults);
      setDeviceId(null);
      setEditing(startInSettings || !space.newChatDefaults);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const value = editing ? draft : space.newChatDefaults;
  const eligible = projects.filter((project) =>
    profile.projectKeys.includes(
      scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
    ),
  );
  const project = eligible.find(
    (project) =>
      scopedProjectKey(scopeProjectRef(project.environmentId, project.id)) === value?.projectKey,
  );
  const environment = environments.find(
    (environment) => environment.environmentId === project?.environmentId,
  );
  const chosenDevice = deviceId ?? project?.environmentId ?? null;
  const configuredModel = value?.modelSelection ?? project?.defaultModelSelection;
  const modelProvider = deriveProviderInstanceEntries(
    environment?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS,
  ).find((entry) => entry.instanceId === configuredModel?.instanceId);
  const providerAvailable =
    !value?.modelSelection || (!!modelProvider && isProviderInstancePickerReady(modelProvider));
  const folder = useEnvironmentQuery(
    open && project && environment?.connection.phase === "connected"
      ? filesystemEnvironment.browse({
          environmentId: project.environmentId,
          input: { partialPath: `${project.workspaceRoot.replace(/[\\/]+$/, "")}/` },
        })
      : null,
  );
  const available =
    !!project &&
    environment?.connection.phase === "connected" &&
    project.workspaceRoot === value?.workspaceRoot &&
    folder.data !== null &&
    !folder.error &&
    providerAvailable;
  const configure = () => {
    setDraft(space.newChatDefaults);
    setDeviceId(project?.environmentId ?? null);
    setEditing(true);
    setError(null);
  };
  const launch = async () => {
    if (pending.current || !available || !project || !value) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onLaunch(scopeProjectRef(project.environmentId, project.id), value);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open chat. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={disabled}
            aria-label={`New chat in ${space.name}`}
            className={cn(
              "absolute bottom-1 right-1",
              selected
                ? "text-zinc-50 hover:bg-white/10 hover:text-zinc-50 dark:text-zinc-900 dark:hover:bg-black/10 dark:hover:text-zinc-900"
                : "text-sidebar-muted-foreground",
            )}
          />
        }
      >
        <PlusIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup
        side="right"
        align="start"
        className="w-72"
        viewportClassName={editing ? "p-2.5" : "p-1.5"}
        aria-label={`New chat in ${space.name}`}
      >
        {editing && (
          <PopoverTitle className="mb-2 text-xs font-medium">New-chat defaults</PopoverTitle>
        )}
        {editing ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              <span>Device</span>
              <Select
                value={chosenDevice}
                onValueChange={(id) => {
                  if (id !== null) {
                    setDeviceId(id);
                    setDraft(undefined);
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-full" aria-label="Space default device">
                  <SelectValue placeholder="Choose device">
                    {environments.find((env) => env.environmentId === chosenDevice)?.label ??
                      "Choose device"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {environments
                    .filter((env) => eligible.some((p) => p.environmentId === env.environmentId))
                    .map((env) => (
                      <SelectItem key={env.environmentId} value={env.environmentId}>
                        {env.label}
                        {env.connection.phase !== "connected" ? " (offline)" : ""}
                      </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
            </label>
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              <span>Project folder</span>
              <Select
                value={value?.projectKey ?? null}
                onValueChange={(key) => {
                  const next = eligible.find(
                    (p) => scopedProjectKey(scopeProjectRef(p.environmentId, p.id)) === key,
                  );
                  if (next)
                    setDraft({
                      projectKey: key!,
                      workspaceRoot: next.workspaceRoot,
                      deviceLabel:
                        environments.find((env) => env.environmentId === next.environmentId)
                          ?.label ?? "Device",
                    });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label="Space default folder"
                  disabled={!chosenDevice}
                >
                  <SelectValue placeholder="Choose folder">
                    {project?.title ?? "Choose folder"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup className="max-w-96">
                  {eligible
                    .filter((p) => p.environmentId === chosenDevice)
                    .map((p) => (
                      <SelectItem
                        key={p.id}
                        value={scopedProjectKey(scopeProjectRef(p.environmentId, p.id))}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span>{p.title}</span>
                          <span className="break-all text-[10px] text-muted-foreground">
                            {p.workspaceRoot}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
            </label>
            {value && (
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {value.workspaceRoot}
              </p>
            )}
            {!eligible.length && (
              <p className="text-xs text-muted-foreground">
                Add a project to {profile.name} to choose its folder here.
              </p>
            )}
            {project && value && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">More defaults</summary>
                <div className="mt-3 space-y-3">
                  <LaunchModel
                    environmentId={project.environmentId}
                    selection={value.modelSelection}
                    onChange={(modelSelection) => setDraft({ ...value, modelSelection })}
                  />
                  <label className="block space-y-1">
                    <span>Workspace</span>
                    <Select
                      value={value.envMode ?? "default"}
                      onValueChange={(mode) => {
                        if (mode)
                          setDraft({
                            ...value,
                            envMode: mode === "local" || mode === "worktree" ? mode : undefined,
                          });
                      }}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label="Space workspace mode">
                        <SelectValue>
                          {value.envMode === "local"
                            ? "Current checkout"
                            : value.envMode === "worktree"
                              ? "New worktree"
                              : "Use project default"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="default">Use project default</SelectItem>
                        <SelectItem value="local">Current checkout</SelectItem>
                        <SelectItem value="worktree">New worktree</SelectItem>
                      </SelectPopup>
                    </Select>
                  </label>
                </div>
              </details>
            )}
            <div className="flex justify-end gap-1">
              {space.newChatDefaults && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => {
                    onChange({
                      ...profile,
                      spaces: profile.spaces?.map((item) =>
                        item.id === space.id ? { ...item, newChatDefaults: undefined } : item,
                      ),
                    });
                    setDraft(undefined);
                  }}
                >
                  Reset
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => (space.newChatDefaults ? setEditing(false) : onOpenChange(false))}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                disabled={!value || !project}
                onClick={() => {
                  if (!value || !project) return;
                  onChange({
                    ...profile,
                    spaces: profile.spaces?.map((item) =>
                      item.id === space.id ? { ...item, newChatDefaults: value } : item,
                    ),
                  });
                  setEditing(false);
                }}
              >
                Save defaults
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              aria-label={`Open new chat in ${space.name}`}
              disabled={busy || !available}
              onClick={() => void launch()}
              className="group w-full rounded-md px-2 py-1.5 text-left hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <MonitorIcon className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {environment?.label ?? value?.deviceLabel}
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {busy ? "Opening..." : folder.isPending ? "Checking..." : "New chat"}
                </span>
                <ArrowRightIcon className="size-3" />
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground" />
                  }
                >
                  {value?.workspaceRoot}
                </TooltipTrigger>
                <TooltipPopup className="max-w-96 break-all">{value?.workspaceRoot}</TooltipPopup>
              </Tooltip>
            </button>
            <div className="mt-1 flex items-center gap-1 border-t border-border/50 pl-2 pt-1">
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                {value?.modelSelection?.model ?? "Project model"} ·{" "}
                {value?.envMode === "worktree"
                  ? "Worktree"
                  : value?.envMode === "local"
                    ? "Checkout"
                    : "Default workspace"}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Change new-chat defaults"
                disabled={busy}
                onClick={configure}
              >
                <Settings2Icon className="size-3" />
              </Button>
            </div>
            {!providerAvailable && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">
                The saved provider is unavailable on this device. Change defaults.
              </p>
            )}
            {!available && providerAvailable && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">
                {!project
                  ? "Project unavailable in this profile. Change defaults."
                  : environment?.connection.phase !== "connected"
                    ? "Connect this device to open a chat."
                    : project.workspaceRoot !== value?.workspaceRoot
                      ? "Folder changed. Update defaults."
                      : folder.error
                        ? "Folder unavailable. Check the path or change defaults."
                        : "Checking folder..."}
              </p>
            )}
            {error && (
              <p role="alert" className="px-2 py-1 text-[11px] text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
      </PopoverPopup>
    </Popover>
  );
}
