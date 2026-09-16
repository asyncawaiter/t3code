import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import { useEffect, useState } from "react";
import {
  ArrowUpIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MonitorIcon,
  WifiOffIcon,
  SearchIcon,
} from "lucide-react";
import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
} from "@t3tools/client-runtime/state/filesystem";
import { useEnvironments } from "../state/environments";
import { useProjects } from "../state/entities";
import { filesystemEnvironment } from "../state/filesystem";
import { useEnvironmentQuery } from "../state/query";
import { ensureBrowseDirectoryPath, newProjectFolderPath } from "../lib/projectPaths";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ChatLocation } from "../hooks/useChatCreation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "./ui/select";

/** Device and filesystem selection shared by new chats, draft retargeting and space defaults. */
export function ProjectLocationPicker({
  value,
  onChange,
  disabled = false,
  initialEnvironmentId,
}: {
  value: ChatLocation | null;
  initialEnvironmentId?: EnvironmentId | undefined;
  onChange: (value: ChatLocation | null) => void;
  disabled?: boolean;
}) {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const [deviceId, setDeviceId] = useState(
    value?.environmentId ??
      initialEnvironmentId ??
      environments.find((env) => env.connection.phase === "connected")?.environmentId ??
      null,
  );
  const [browsing, setBrowsing] = useState(!value);
  const [query, setQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const chosenId = value?.environmentId ?? deviceId;
  const environment = environments.find((env) => env.environmentId === chosenId);
  const connected = environment?.connection.phase === "connected";
  const platform = environment?.serverConfig?.environment.platform.os ?? "";
  const path = getFilesystemBrowsePath(query, platform);
  const folder = useEnvironmentQuery(
    browsing && connected && chosenId && path.isBrowsing
      ? filesystemEnvironment.browse({
          environmentId: chosenId,
          input: { partialPath: path.directoryPath },
        })
      : null,
  );
  const entries = filterFilesystemBrowseEntries(
    folder.data?.entries ?? [],
    path.filterQuery,
  ).visibleEntries;
  const recent = projects.filter(
    (project) =>
      project.environmentId === chosenId &&
      `${project.title} ${project.workspaceRoot}`.toLowerCase().includes(query.toLowerCase()),
  );
  let newFolderPath: string | null = null;
  let newFolderError: string | null = null;
  if (
    newFolderName !== null &&
    newFolderName.trim() &&
    folder.data &&
    !folder.isPending &&
    !folder.error
  ) {
    try {
      newFolderPath = newProjectFolderPath(folder.data.parentPath, newFolderName, platform);
      if (
        folder.data.entries.some((entry) =>
          platform === "linux"
            ? entry.name === newFolderName.trim()
            : entry.name.toLowerCase() === newFolderName.trim().toLowerCase(),
        )
      ) {
        newFolderError = "This folder already exists. Select it from the list.";
        newFolderPath = null;
      }
    } catch (cause) {
      newFolderError = cause instanceof Error ? cause.message : "Choose another folder name.";
    }
  }
  // Only expose the displayed directory after this device has resolved it.
  useEffect(() => {
    if (!browsing || disabled || newFolderName !== null) return;
    const workspaceRoot =
      connected && path.isBrowsing && !path.filterQuery && !folder.isPending && !folder.error
        ? folder.data?.parentPath
        : undefined;
    if (workspaceRoot && chosenId) {
      if (value?.environmentId !== chosenId || value.workspaceRoot !== workspaceRoot)
        onChange({ environmentId: chosenId, workspaceRoot });
    } else if (value) onChange(null);
  }, [
    browsing,
    newFolderName,
    disabled,
    connected,
    path.isBrowsing,
    path.filterQuery,
    folder.isPending,
    folder.error,
    folder.data?.parentPath,
    chosenId,
    value,
    onChange,
  ]);
  const browse = (nextQuery: string) => {
    setNewFolderName(null);
    onChange(null);
    setQuery(nextQuery);
    setBrowsing(true);
  };
  const choose = (workspaceRoot: string) => {
    if (!chosenId || !connected) return;
    onChange({ environmentId: chosenId, workspaceRoot });
    setBrowsing(false);
    setQuery("");
  };
  const useNewFolder = () => {
    if (
      disabled ||
      !connected ||
      !chosenId ||
      !newFolderPath ||
      !folder.data ||
      newFolderName === null
    )
      return;
    onChange({
      environmentId: chosenId,
      workspaceRoot: newFolderPath,
      newFolder: { parentPath: folder.data.parentPath, name: newFolderName.trim() },
    });
    setBrowsing(false);
    setQuery("");
    setNewFolderName(null);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/50">
      <div className="space-y-1.5 border-b border-border/60 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MonitorIcon className="size-3.5" />
          <span>Device</span>
        </div>
        <Select
          value={chosenId}
          onValueChange={(id) => {
            const env = environments.find((item) => item.environmentId === id);
            if (!env) return;
            setDeviceId(env.environmentId);
            setNewFolderName(null);
            onChange(null);
            setQuery("");
            setBrowsing(true);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full min-w-0" aria-label="Device">
            <SelectValue>{environment?.label ?? "Choose device"}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {environments.map((env) => (
              <SelectItem
                key={env.environmentId}
                value={env.environmentId}
                disabled={env.connection.phase !== "connected"}
              >
                {env.label}
                {env.connection.phase !== "connected" ? " (offline)" : ""}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      {value && !browsing ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDeviceId(value.environmentId);
            browse(ensureBrowseDirectoryPath(value.newFolder?.parentPath ?? value.workspaceRoot));
          }}
          className="flex w-full min-w-0 items-center gap-2.5 p-3 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
          aria-label="Change folder"
        >
          <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 flex-1 truncate font-mono" />}>
              {value.workspaceRoot}
            </TooltipTrigger>
            <TooltipPopup>{value.workspaceRoot}</TooltipPopup>
          </Tooltip>
          <span className="shrink-0 text-xs text-muted-foreground">
            {value.newFolder ? "New folder" : "Change"}
          </span>
        </button>
      ) : chosenId && connected ? (
        <div>
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              size="compact"
              unstyled
              autoFocus
              aria-label="Find project or folder"
              placeholder="Find project or enter a path..."
              value={query}
              disabled={disabled}
              onChange={(event) => browse(event.target.value)}
              className="min-w-0 flex-1 [&_input]:px-0"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (path.isBrowsing && folder.data && !folder.isPending && !folder.error) {
                    const exact = entries.find((entry) => entry.name === path.filterQuery);
                    if (path.filterQuery && exact) choose(exact.fullPath);
                    else if (!path.filterQuery) choose(folder.data.parentPath);
                  } else if (recent.length === 1) choose(recent[0]!.workspaceRoot);
                }
              }}
            />
          </div>
          <div className="h-40 overflow-y-auto overscroll-contain p-1.5">
            {path.isBrowsing ? (
              <>
                {path.canBrowseUp && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={disabled}
                    onClick={() => browse(path.parentPath ?? "~/")}
                  >
                    <ArrowUpIcon className="size-3" />
                    Parent folder
                  </Button>
                )}
                {folder.isPending ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">Loading folders...</p>
                ) : folder.error ? (
                  <p role="alert" className="px-2 py-2 text-xs text-destructive">
                    {folder.error}
                  </p>
                ) : (
                  entries.map((entry) => (
                    <button
                      key={entry.fullPath}
                      type="button"
                      disabled={disabled}
                      onClick={() => browse(ensureBrowseDirectoryPath(entry.fullPath))}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <ChevronRightIcon className="size-3 text-muted-foreground" />
                    </button>
                  ))
                )}
                {!folder.isPending && !folder.error && entries.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">No matching subfolders</p>
                )}
              </>
            ) : (
              <>
                {recent.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    disabled={disabled}
                    onClick={() => choose(project.workspaceRoot)}
                    className="block w-full rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="block truncate text-xs font-medium">{project.title}</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="block truncate font-mono text-xs leading-5 text-muted-foreground" />
                        }
                      >
                        {project.workspaceRoot}
                      </TooltipTrigger>
                      <TooltipPopup>{project.workspaceRoot}</TooltipPopup>
                    </Tooltip>
                  </button>
                ))}
              </>
            )}
          </div>
          {newFolderName !== null && (
            <div
              className="space-y-2 border-t border-border/60 p-3"
              role="group"
              aria-label="New folder"
            >
              <p className="break-all text-[11px] text-muted-foreground">
                {folder.data && !folder.isPending && !folder.error
                  ? `In ${folder.data.parentPath}`
                  : "Choose a parent folder above"}
              </p>
              <Input
                size="compact"
                autoFocus
                aria-label="New folder name"
                placeholder="Folder name"
                value={newFolderName}
                disabled={disabled}
                aria-invalid={!!newFolderError}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    useNewFolder();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setNewFolderName(null);
                  }
                }}
              />
              {newFolderError && (
                <p role="alert" className="text-xs text-destructive">
                  {newFolderError}
                </p>
              )}
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setNewFolderName(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={disabled || !newFolderPath}
                  onClick={useNewFolder}
                >
                  Use new folder
                </Button>
              </div>
            </div>
          )}
          <div className="flex min-h-9 items-center gap-2 border-t border-border/60 px-3 py-1.5">
            {path.isBrowsing ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" />
                  }
                >
                  {value ? `Selected: ${value.workspaceRoot}` : "Navigate to a folder to select it"}
                </TooltipTrigger>
                {value && <TooltipPopup>{value.workspaceRoot}</TooltipPopup>}
              </Tooltip>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                className="min-w-0 flex-1 justify-start"
                onClick={() => browse("~/")}
              >
                <FolderOpenIcon className="size-3" />
                Browse this device
              </Button>
            )}
            {newFolderName === null && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={
                  disabled ||
                  (path.isBrowsing && (folder.isPending || !!folder.error || !folder.data))
                }
                onClick={() => {
                  if (!path.isBrowsing) browse("~/");
                  onChange(null);
                  setNewFolderName(path.isBrowsing ? path.filterQuery : "");
                }}
              >
                <FolderPlusIcon className="size-3" />
                New folder
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {value?.newFolder && !browsing && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          This folder will be created on {environment?.label ?? "the selected device"} when you
          save.
        </p>
      )}
      {environment && !connected && (
        <div
          role="status"
          className="flex items-start gap-2 border-t border-border/60 bg-warning-surface px-3 py-2.5 text-xs leading-relaxed text-warning-foreground"
        >
          <WifiOffIcon className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-medium">Device offline</p>
            <p>Reconnect this device or choose another.</p>
          </div>
        </div>
      )}
      {environments.length === 0 && (
        <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          Connect a device in Settings to choose a folder.
        </p>
      )}
    </div>
  );
}
