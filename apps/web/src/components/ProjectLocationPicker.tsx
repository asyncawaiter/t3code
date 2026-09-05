import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import { useState } from "react";
import { ArrowUpIcon, ChevronRightIcon, FolderOpenIcon, SearchIcon } from "lucide-react";
import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
} from "@t3tools/client-runtime/state/filesystem";
import { useEnvironments } from "../state/environments";
import { useProjects } from "../state/entities";
import { filesystemEnvironment } from "../state/filesystem";
import { useEnvironmentQuery } from "../state/query";
import { ensureBrowseDirectoryPath } from "../lib/projectPaths";
import type { ChatLocation } from "../hooks/useChatCreation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "./ui/select";

/** Device and filesystem selection shared by new chats, draft retargeting and space defaults. */
export function ProjectLocationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ChatLocation | null;
  onChange: (value: ChatLocation | null) => void;
  disabled?: boolean;
}) {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const [deviceId, setDeviceId] = useState(
    value?.environmentId ??
      environments.find((env) => env.connection.phase === "connected")?.environmentId ??
      null,
  );
  const [browsing, setBrowsing] = useState(!value);
  const [query, setQuery] = useState("");
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
  const choose = (workspaceRoot: string) => {
    if (!chosenId || !connected) return;
    onChange({ environmentId: chosenId, workspaceRoot });
    setBrowsing(false);
    setQuery("");
  };
  return (
    <div className="space-y-2">
      <Select
        value={chosenId}
        onValueChange={(id) => {
          const env = environments.find((item) => item.environmentId === id);
          if (!env) return;
          setDeviceId(env.environmentId);
          onChange(null);
          setQuery("");
          setBrowsing(true);
        }}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="w-full" aria-label="Device">
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
      {value && !browsing ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setQuery(ensureBrowseDirectoryPath(value.workspaceRoot));
            setDeviceId(value.environmentId);
            onChange(null);
            setBrowsing(true);
          }}
          className="flex w-full min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-left text-xs hover:bg-muted"
          aria-label="Change folder"
        >
          <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
              {value.workspaceRoot}
            </TooltipTrigger>
            <TooltipPopup>{value.workspaceRoot}</TooltipPopup>
          </Tooltip>
          <ChevronRightIcon className="size-3.5 shrink-0" />
        </button>
      ) : chosenId && connected ? (
        <div className="overflow-hidden rounded-md border border-border/70">
          <div className="flex items-center gap-1.5 border-b border-border/70 px-2">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              size="compact"
              aria-label="Find project or folder"
              placeholder="Search projects or type ~/path/"
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
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
          <div className="max-h-44 overflow-y-auto p-1">
            {path.isBrowsing ? (
              <>
                {path.canBrowseUp && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => setQuery(path.parentPath ?? "~/")}
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
                      onClick={() => setQuery(ensureBrowseDirectoryPath(entry.fullPath))}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
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
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="block truncate text-xs">{project.title}</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="block truncate text-[11px] text-muted-foreground" />
                        }
                      >
                        {project.workspaceRoot}
                      </TooltipTrigger>
                      <TooltipPopup>{project.workspaceRoot}</TooltipPopup>
                    </Tooltip>
                  </button>
                ))}
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start"
                  onClick={() => setQuery("~/")}
                >
                  <FolderOpenIcon className="size-3.5" />
                  Browse folders on {environment?.label}
                </Button>
              </>
            )}
          </div>
          {path.isBrowsing &&
            folder.data &&
            !folder.error &&
            !folder.isPending &&
            !path.filterQuery && (
              <div className="flex items-center gap-2 border-t border-border/70 px-2 py-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" />
                    }
                  >
                    {folder.data.parentPath}
                  </TooltipTrigger>
                  <TooltipPopup>{folder.data.parentPath}</TooltipPopup>
                </Tooltip>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => choose(folder.data!.parentPath)}
                >
                  Use folder
                </Button>
              </div>
            )}
        </div>
      ) : null}
      {environment && !connected && (
        <p role="alert" className="text-xs text-destructive">
          {environment.label} is offline. Reconnect it or choose another device.
        </p>
      )}
      {environments.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Connect a device in Settings to choose a folder.
        </p>
      )}
    </div>
  );
}
