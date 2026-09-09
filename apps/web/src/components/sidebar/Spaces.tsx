import { useComposerDraftStore, composerDraftHasUserContent } from "../../composerDraftStore";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { SpaceLaunch } from "./SpaceLaunch";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { OUTSIDE_SPACES } from "./Spaces.logic";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { useEffect, useState } from "react";
import { PlusIcon, CheckIcon, XIcon, PencilIcon, MoreHorizontalIcon } from "lucide-react";
import { type Profile, type ProfileSpace, ALL_PROFILE_ID } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { randomUUID, cn } from "../../lib/utils";

export const SPACE_THREAD_DRAG = "application/x-t3-space-thread";
const SPACE_DRAG = "application/x-t3-space";

function SpaceNameEditor({
  initialName,
  label,
  disabled,
  onSave,
  onCancel,
}: {
  initialName: string;
  label: string;
  disabled: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <form
      className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md border border-sidebar-border bg-sidebar-control-surface/50 px-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && name.trim()) onSave(name.trim());
      }}
    >
      <Input
        autoFocus
        size="compact"
        aria-label={label}
        placeholder="Name this space"
        maxLength={48}
        value={name}
        disabled={disabled}
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <Button
        type="submit"
        size="icon-xs"
        variant="ghost"
        aria-label="Save space name"
        disabled={disabled || !name.trim()}
      >
        <CheckIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Cancel space name"
        onClick={onCancel}
      >
        <XIcon className="size-3.5" />
      </Button>
    </form>
  );
}

export function SpaceToolbar({
  profile,
  onChange,
  disabled,
  onCreated,
  selectedSpaceId,
  onFilterChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  disabled: boolean;
  onCreated?: (id: string) => void;
  selectedSpaceId: string | null;
  onFilterChange: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const create = () => {
      if (!disabled) setCreating(true);
    };
    window.addEventListener("t3:create-space", create);
    return () => window.removeEventListener("t3:create-space", create);
  }, [disabled]);
  if (profile.id === ALL_PROFILE_ID) return null;
  return (
    <div className="px-1 pt-1" data-thread-selection-safe>
      <div className="flex h-7 items-center justify-between px-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-sidebar-muted-foreground">
          <span className="truncate font-medium text-sidebar-foreground">{profile.name}</span>
          <span aria-hidden="true" className="opacity-50">
            /
          </span>
          <span>Spaces</span>
        </span>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="New space"
                disabled={disabled || (profile.spaces?.length ?? 0) >= 64}
                onClick={() => setCreating(true)}
              />
            }
          >
            <PlusIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>New space in {profile.name}</TooltipPopup>
        </Tooltip>
      </div>
      {profile.spaces?.length ? (
        <Select
          value={selectedSpaceId ?? "all"}
          onValueChange={(id) => {
            if (id !== null) onFilterChange(id === "all" ? null : id);
          }}
        >
          <SelectTrigger
            size="xs"
            aria-label="Show chats in profile"
            className="mb-1 h-6 w-full min-w-0 border-0 bg-sidebar-foreground/5 px-2 text-[10px] shadow-none sm:h-6"
          >
            <SelectValue>
              {selectedSpaceId === OUTSIDE_SPACES
                ? "Outside spaces"
                : selectedSpaceId
                  ? (profile.spaces?.find((space) => space.id === selectedSpaceId)?.name ??
                    "Outside spaces")
                  : "All threads"}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            <SelectItem value="all">All threads</SelectItem>
            <SelectItem value={OUTSIDE_SPACES}>Outside spaces</SelectItem>
            {(profile.spaces ?? []).map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : null}
      {creating ? (
        <SpaceNameEditor
          initialName=""
          label="New space name"
          disabled={disabled}
          onCancel={() => setCreating(false)}
          onSave={(name) => {
            if ((profile.spaces?.length ?? 0) >= 64) return;
            const id = randomUUID();
            onChange({
              ...profile,
              spaces: [...(profile.spaces ?? []), { id, name, threads: [] }],
            });
            setCreating(false);
            onCreated?.(id);
          }}
        />
      ) : null}
    </div>
  );
}

export function SpaceTile({
  offerSetup = false,
  profile,
  space,
  count,
  selected,
  attention,
  onSelect,
  onChange,
  onMove,
  onLaunch,
  disabled,
}: {
  offerSetup?: boolean;
  profile: Profile;
  space: ProfileSpace;
  count: number;
  selected: boolean;
  attention: boolean;
  onSelect: () => void;
  onChange: (profile: Profile) => void;
  onMove: (keys: string[], spaceId: string | null) => void;
  onLaunch: (
    project: ScopedProjectRef,
    defaults: NonNullable<ProfileSpace["newChatDefaults"]>,
  ) => Promise<void>;
  disabled: boolean;
}) {
  const draftCount = useComposerDraftStore(
    (store) =>
      Object.entries(store.draftThreadsByThreadKey).filter(
        ([key, draft]) =>
          !draft.promotedTo &&
          composerDraftHasUserContent(store.draftsByThreadKey[key]) &&
          space.threads.some(
            (item) =>
              item.threadKey ===
                scopedThreadKey(scopeThreadRef(draft.environmentId, draft.threadId)) &&
              item.projectKey === `${draft.environmentId}:${draft.projectId}`,
          ),
      ).length,
  );
  const [launchOpen, setLaunchOpen] = useState(offerSetup);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const spaces = profile.spaces ?? [];
  const index = spaces.findIndex((item) => item.id === space.id);
  const move = (destination: number) => {
    if (disabled || destination < 0 || destination >= spaces.length) return;
    const reordered = spaces.filter((item) => item.id !== space.id);
    reordered.splice(destination, 0, space);
    onChange({ ...profile, spaces: reordered });
  };
  return (
    <li
      className="min-w-0 list-none"
      data-thread-selection-safe
      onDragOver={(event) => {
        if (
          !disabled &&
          [SPACE_THREAD_DRAG, SPACE_DRAG].some((type) => event.dataTransfer.types.includes(type))
        ) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(event) => {
        setDragOver(false);
        if (disabled) return;
        const source = event.dataTransfer.getData(SPACE_DRAG);
        const keys = event.dataTransfer.getData(SPACE_THREAD_DRAG);
        if (!source && !keys) return;
        event.preventDefault();
        event.stopPropagation();
        if (source) {
          const dragged = spaces.find((item) => item.id === source);
          if (!dragged || dragged.id === space.id) return;
          const reordered = spaces.filter((item) => item.id !== source);
          reordered.splice(index, 0, dragged);
          onChange({ ...profile, spaces: reordered });
        } else {
          try {
            const parsed: unknown = JSON.parse(keys);
            if (
              Array.isArray(parsed) &&
              parsed.every((key): key is string => typeof key === "string")
            ) {
              onMove(parsed, space.id);
              onSelect();
            }
          } catch {
            /* Ignore unrelated drag payloads. */
          }
        }
      }}
    >
      <div
        className={cn(
          "group/space relative h-18 overflow-hidden rounded-xl transition-colors",
          selected
            ? "bg-zinc-700 text-zinc-50 dark:bg-zinc-300 dark:text-zinc-900"
            : "bg-sidebar-foreground/5 text-sidebar-foreground hover:bg-sidebar-foreground/10",
          dragOver && "ring-2 ring-sidebar-foreground/30",
        )}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!disabled) setMenuOpen(true);
        }}
        draggable={!disabled && !renaming}
        onDragStart={(event) => {
          event.dataTransfer.setData(SPACE_DRAG, space.id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        {renaming ? (
          <SpaceNameEditor
            initialName={space.name}
            label="Rename space"
            disabled={disabled}
            onCancel={() => setRenaming(false)}
            onSave={(name) => {
              onChange({
                ...profile,
                spaces: spaces.map((item) => (item.id === space.id ? { ...item, name } : item)),
              });
              setRenaming(false);
            }}
          />
        ) : (
          <>
            <button
              type="button"
              className="flex h-full w-full flex-col items-start gap-0.5 px-2.5 py-2 pr-6 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
              aria-label={`Open space ${space.name}`}
              aria-pressed={selected}
              onClick={onSelect}
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
              aria-description="Drag to reorder, or hold Alt and use arrow keys."
              onKeyDown={(event) => {
                if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[
                  event.key
                ];
                if (offset === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                move(index + offset);
              }}
            >
              <span className="flex w-full min-w-0 shrink-0 items-center gap-1.5 text-inherit">
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="truncate text-xs font-medium leading-4" />}
                  >
                    {space.name}
                  </TooltipTrigger>
                  <TooltipPopup>{space.name}</TooltipPopup>
                </Tooltip>
              </span>
              <span className="h-3.5 w-full shrink-0 truncate text-[10px] leading-3.5 opacity-75">
                {space.newChatDefaults
                  ? `${space.newChatDefaults.deviceLabel} · ${space.newChatDefaults.workspaceRoot.split(/[\\/]/).findLast(Boolean)}`
                  : null}
              </span>
              <span className="mt-auto flex w-full min-w-0 items-center gap-1 text-[10px] text-inherit opacity-75">
                {attention ? (
                  <span
                    aria-label="Needs attention"
                    className="size-1.5 rounded-full bg-amber-500"
                  />
                ) : null}
                <span className="truncate">
                  {count > 0 || draftCount === 0
                    ? `${count} ${count === 1 ? "thread" : "threads"}`
                    : ""}
                  {count > 0 && draftCount > 0 ? " · " : ""}
                  {draftCount > 0 ? `${draftCount} ${draftCount === 1 ? "draft" : "drafts"}` : ""}
                </span>
                {attention ? <span className="sr-only">Needs you</span> : null}
              </span>
            </button>
            <SpaceLaunch
              profile={profile}
              space={space}
              selected={selected}
              disabled={disabled}
              onChange={onChange}
              onLaunch={onLaunch}
              open={launchOpen}
              onOpenChange={setLaunchOpen}
            />
            <Menu open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Space actions for ${space.name}`}
                    className={cn(
                      "absolute right-1 top-1 opacity-75 hover:opacity-100 group-hover/space:opacity-100 focus-visible:opacity-100",
                      selected
                        ? "text-zinc-50 hover:bg-white/10 hover:text-zinc-50 dark:text-zinc-900 dark:hover:bg-black/10 dark:hover:text-zinc-900"
                        : "text-sidebar-muted-foreground",
                    )}
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" className="w-40">
                <MenuItem className="min-h-7 text-xs" onClick={() => setRenaming(true)}>
                  <PencilIcon className="size-3" />
                  Rename
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  className="min-h-7 text-xs"
                  variant="destructive"
                  onClick={() =>
                    onChange({ ...profile, spaces: spaces.filter((item) => item.id !== space.id) })
                  }
                >
                  <XIcon className="size-3" />
                  Delete space
                </MenuItem>
              </MenuPopup>
            </Menu>
          </>
        )}
      </div>
    </li>
  );
}
