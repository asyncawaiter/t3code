import { spaceProjectKeys } from "./Spaces.logic";
import { ProjectLocationPicker } from "../ProjectLocationPicker";
import {
  useResolveChatProject,
  useSaveProfiles,
  type ChatLocation,
} from "../../hooks/useChatCreation";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { useAtomValue } from "@effect/atom-react";
import { useRef, useState } from "react";
import { PlusIcon, ArrowRightIcon, MonitorIcon, Settings2Icon, WifiOffIcon } from "lucide-react";
import {
  spaceDeviceDefaults,
  withSpaceDeviceDefaults,
  EnvironmentId,
  type Profile,
  type ProfileSpace,
  type ScopedProjectRef,
  type SpaceNewChatDefaults,
} from "@t3tools/contracts";
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

type Defaults = SpaceNewChatDefaults;

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
          environmentId={environmentId}
          modelOptions={resolved.options}
          activeInstanceId={resolved.instanceId}
          model={resolved.model}
          lockedProvider={null}
          instanceEntries={entries}
          modelOptionsByInstance={options}
          triggerVariant="outline"
          triggerClassName="w-full justify-between"
          onInstanceModelChange={(instanceId, model, options) =>
            onChange(createModelSelection(instanceId, model, options))
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
  writeBlockReason,
  onLaunch,
  open,
  onOpenChange,
}: {
  profile: Profile;
  space: ProfileSpace;
  selected: boolean;
  writeBlockReason: string | null;
  onLaunch: (project: ScopedProjectRef, defaults: Defaults) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { environments } = useEnvironments();
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaults = spaceDeviceDefaults(space);
  const devices = [
    ...environments.map((device) => ({
      environmentId: device.environmentId,
      label: device.label,
      connected: device.connection.phase === "connected",
    })),
    ...Object.entries(defaults)
      .filter(([id]) => !environments.some((device) => device.environmentId === id))
      .map(([id, value]) => ({
        environmentId: EnvironmentId.make(id),
        label: value.deviceLabel,
        connected: false,
      })),
  ].filter((device) => device.connected || defaults[device.environmentId]);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setEditingDevice(null);
        onOpenChange(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`New chat in ${space.name}`}
            className={cn(
              "absolute bottom-1 right-1 [--control-icon-color:currentColor]",
              selected
                ? "text-sidebar-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
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
        className="w-80 max-w-[calc(100vw-2rem)]"
        viewportClassName="max-h-[min(36rem,80dvh)] overflow-y-auto p-2"
        aria-label={`New chat in ${space.name}`}
      >
        <PopoverTitle className="mb-2 truncate px-1 text-xs font-medium">
          New chat in {space.name}
        </PopoverTitle>
        {writeBlockReason && (
          <p role="status" className="mb-2 px-1 text-xs text-muted-foreground">
            {writeBlockReason}
          </p>
        )}
        {open && (
          <div className="space-y-1.5">
            {devices.map((device) => (
              <SpaceDeviceLaunch
                key={device.environmentId}
                profile={profile}
                space={space}
                environmentId={device.environmentId}
                label={device.label}
                connected={device.connected}
                defaults={defaults[device.environmentId]}
                editing={editingDevice === device.environmentId}
                setEditing={(editing) => setEditingDevice(editing ? device.environmentId : null)}
                busy={busy}
                setBusy={setBusy}
                writeBlockReason={writeBlockReason}
                onLaunch={onLaunch}
                onClose={() => onOpenChange(false)}
              />
            ))}
            {devices.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Connect a device to choose its default folder.
              </p>
            )}
          </div>
        )}
      </PopoverPopup>
    </Popover>
  );
}

function SpaceDeviceLaunch({
  profile,
  space,
  environmentId,
  label,
  connected,
  defaults,
  editing,
  setEditing,
  busy,
  setBusy,
  writeBlockReason,
  onLaunch,
  onClose,
}: {
  profile: Profile;
  space: ProfileSpace;
  environmentId: EnvironmentId;
  label: string;
  connected: boolean;
  defaults: Defaults | undefined;
  editing: boolean;
  setEditing: (value: boolean) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  writeBlockReason: string | null;
  onLaunch: (project: ScopedProjectRef, defaults: Defaults) => Promise<void>;
  onClose: () => void;
}) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const suggestedProjects = projects.filter(
    (project) =>
      project.environmentId === environmentId &&
      spaceProjectKeys(space).includes(`${environmentId}:${project.id}`),
  );
  const initialLocation = (): ChatLocation | null =>
    defaults ? { environmentId, workspaceRoot: defaults.workspaceRoot } : null;
  const [location, setLocation] = useState<ChatLocation | null>(initialLocation);
  const [draft, setDraft] = useState(defaults);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const resolveProject = useResolveChatProject();
  const saveProfiles = useSaveProfiles();
  const project = projects.find(
    (item) =>
      item.environmentId === environmentId &&
      `${environmentId}:${item.id}` === defaults?.projectKey &&
      profile.projectKeys.includes(defaults.projectKey),
  );
  const environment = environments.find((item) => item.environmentId === environmentId);
  const modelProvider = deriveProviderInstanceEntries(
    environment?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS,
  ).find((entry) => entry.instanceId === defaults?.modelSelection?.instanceId);
  const providerAvailable =
    !defaults?.modelSelection || (!!modelProvider && isProviderInstancePickerReady(modelProvider));
  const folder = useEnvironmentQuery(
    connected && project && defaults && !editing
      ? filesystemEnvironment.browse({
          environmentId,
          input: { partialPath: `${defaults.workspaceRoot.replace(/[\\/]+$/, "")}/` },
        })
      : null,
  );
  const available =
    !!project &&
    connected &&
    project.workspaceRoot === defaults?.workspaceRoot &&
    folder.data !== null &&
    !folder.error &&
    providerAvailable;
  const configure = () => {
    setDraft(defaults);
    setLocation(initialLocation());
    setError(null);
    setEditing(true);
  };
  const updateDefaults = (value: Defaults | undefined) =>
    saveProfiles((profiles) => {
      const current = profiles.find((item) => item.id === profile.id);
      if (!current?.spaces?.some((item) => item.id === space.id))
        throw new Error("This space was deleted.");
      return profiles.map((item) =>
        item.id === profile.id
          ? {
              ...item,
              spaces: item.spaces?.map((entry) =>
                entry.id === space.id
                  ? withSpaceDeviceDefaults(entry, environmentId, value)
                  : entry,
              ),
            }
          : item,
      );
    });
  const perform = async (operation: () => Promise<void>) => {
    if (pending.current || busy || writeBlockReason) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this location. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const save = (launch: boolean) =>
    perform(async () => {
      if (!location || location.environmentId !== environmentId) return;
      const resolved = await resolveProject(location, profile.id);
      const value: Defaults = {
        projectKey: scopedProjectKey(resolved.projectRef),
        workspaceRoot: resolved.workspaceRoot,
        deviceLabel: resolved.deviceLabel,
        ...(draft?.modelSelection ? { modelSelection: draft.modelSelection } : {}),
        ...(draft?.envMode ? { envMode: draft.envMode } : {}),
      };
      // Retrying a save or launch must not recreate a folder that already succeeded.
      setLocation({ environmentId, workspaceRoot: resolved.workspaceRoot });
      await updateDefaults(value);
      setDraft(value);
      if (launch) {
        await onLaunch(resolved.projectRef, value);
        onClose();
      } else setEditing(false);
    });
  return (
    <section
      aria-label={`${label} default folder`}
      className={cn(
        "rounded-md",
        defaults || editing ? "border border-border/60 bg-background/30" : "hover:bg-foreground/5",
      )}
    >
      <div className="flex min-h-8 items-center gap-1 px-2 py-1">
        {connected ? (
          <MonitorIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <WifiOffIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Tooltip>
          <TooltipTrigger render={<span className="min-w-0 flex-1 truncate text-xs font-medium" />}>
            {label}
          </TooltipTrigger>
          <TooltipPopup>{label}</TooltipPopup>
        </Tooltip>
        {!connected && <span className="text-[10px] text-muted-foreground">Offline</span>}
        {!editing &&
          (defaults ? (
            <>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || !!writeBlockReason || !available}
                aria-label={`New chat on ${label}`}
                onClick={() =>
                  void perform(async () => {
                    if (!available || !project) return;
                    await onLaunch(scopeProjectRef(environmentId, project.id), defaults);
                    onClose();
                  })
                }
              >
                New chat
                <ArrowRightIcon className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Change default folder on ${label}`}
                disabled={busy}
                onClick={configure}
              >
                <Settings2Icon className="size-3" />
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              disabled={busy || !connected || !!writeBlockReason}
              aria-label={`Choose default folder on ${label}`}
              onClick={configure}
            >
              <PlusIcon className="size-3" />
              Choose folder
            </Button>
          ))}
      </div>
      {!editing && defaults && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="mx-2 mb-2 truncate font-mono text-[11px] text-muted-foreground" />
              }
            >
              {defaults.workspaceRoot}
            </TooltipTrigger>
            <TooltipPopup className="max-w-96 break-all">{defaults.workspaceRoot}</TooltipPopup>
          </Tooltip>
          {connected && !available && (
            <p className="px-2 pb-2 text-[10px] text-muted-foreground">
              {!project
                ? "Folder unavailable in this profile. Change defaults."
                : !providerAvailable
                  ? "Saved provider unavailable. Change defaults."
                  : project.workspaceRoot !== defaults.workspaceRoot
                    ? "Folder changed. Update defaults."
                    : folder.error
                      ? "Folder unavailable. Check the path."
                      : "Checking folder..."}
            </p>
          )}
        </>
      )}
      {editing && (
        <div className="space-y-2 px-2 pb-2">
          <ProjectLocationPicker
            key={environmentId}
            fixedEnvironmentId={environmentId}
            suggestedProjects={suggestedProjects}
            value={location}
            disabled={busy || !connected}
            onChange={setLocation}
          />
          {location && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">More defaults</summary>
              <div className="mt-2 space-y-2">
                <LaunchModel
                  environmentId={environmentId}
                  selection={draft?.modelSelection}
                  onChange={(modelSelection) =>
                    setDraft({
                      projectKey: "",
                      workspaceRoot: location.workspaceRoot,
                      deviceLabel: label,
                      ...draft,
                      modelSelection,
                    })
                  }
                />
                <label className="block space-y-1">
                  <span>Workspace</span>
                  <Select
                    value={draft?.envMode ?? "default"}
                    onValueChange={(mode) => {
                      if (mode)
                        setDraft({
                          projectKey: "",
                          workspaceRoot: location.workspaceRoot,
                          deviceLabel: label,
                          ...draft,
                          envMode: mode === "local" || mode === "worktree" ? mode : undefined,
                        });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full"
                      aria-label={`Workspace mode on ${label}`}
                    >
                      <SelectValue>
                        {draft?.envMode === "local"
                          ? "Current checkout"
                          : draft?.envMode === "worktree"
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
          <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border/50 pt-2">
            {defaults && (
              <Button
                size="xs"
                variant="ghost"
                className="mr-auto"
                disabled={busy || !!writeBlockReason}
                onClick={() =>
                  void perform(async () => {
                    await updateDefaults(undefined);
                    setEditing(false);
                  })
                }
              >
                Reset
              </Button>
            )}
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy || !!writeBlockReason || !connected || !location}
              onClick={() => void save(false)}
            >
              Save
            </Button>
            <Button
              size="xs"
              disabled={busy || !!writeBlockReason || !connected || !location}
              onClick={() => void save(true)}
            >
              Save & open
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="px-2 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
