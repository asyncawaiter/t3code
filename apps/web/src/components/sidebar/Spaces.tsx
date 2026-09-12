import { useComposerDraftStore, composerDraftHasUserContent } from "../../composerDraftStore";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { SpaceLaunch } from "./SpaceLaunch";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon, CheckIcon, XIcon, PencilIcon, MoreHorizontalIcon } from "lucide-react";
import { type Profile, type ProfileSpace, ALL_PROFILE_ID } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { randomUUID, cn } from "../../lib/utils";
import { spaceDragId } from "./Spaces.logic";

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
      if (!disabled && profile.id !== ALL_PROFILE_ID) setCreating(true);
    };
    window.addEventListener("t3:create-space", create);
    return () => window.removeEventListener("t3:create-space", create);
  }, [disabled, profile.id]);
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

        <Button
          size="xs"
          variant="ghost"
          aria-pressed={selectedSpaceId === null}
          onClick={() => onFilterChange(null)}
          className="h-6 px-1.5 text-[10px]"
        >
          All chats
        </Button>
        {profile.id !== ALL_PROFILE_ID ? (
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
        ) : null}
      </div>
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

export function DefaultSpaceTile({
  profileId,
  dropDisabled,
  count,
  selected,
  onSelect,
  onNewChat,
}: {
  profileId: string;
  dropDisabled: boolean;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onNewChat: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: spaceDragId(profileId, null),
    data: { kind: "space", profileId, spaceId: null },
    disabled: dropDisabled,
  });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "relative h-18 min-w-0 list-none rounded-xl",
        isOver && "ring-2 ring-sidebar-foreground/50",
      )}
      data-thread-selection-safe
    >
      <button
        type="button"
        aria-label="Open Default space"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex h-full w-full flex-col items-start rounded-xl px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          selected
            ? "bg-zinc-700 text-zinc-50 dark:bg-zinc-300 dark:text-zinc-900"
            : "bg-sidebar-foreground/5 text-sidebar-foreground hover:bg-sidebar-foreground/10",
        )}
      >
        <span className="w-full truncate text-xs font-medium leading-4">Default</span>
        <span className="w-full truncate text-[10px] leading-3.5 opacity-75">Unassigned chats</span>
        <span className="mt-auto w-full truncate pr-7 text-[10px] opacity-75">
          {count} {count === 1 ? "chat" : "chats"}
        </span>
      </button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="New chat in Default"
        onClick={onNewChat}
        className={cn(
          "absolute bottom-1 right-1 [--control-icon-color:currentColor]",
          selected &&
            "text-zinc-50 hover:bg-white/10 hover:text-zinc-50 dark:text-zinc-900 dark:hover:bg-black/10 dark:hover:text-zinc-900",
        )}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </li>
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
  onLaunch,
  writeBlockReason,
}: {
  offerSetup?: boolean;
  profile: Profile;
  space: ProfileSpace;
  count: number;
  selected: boolean;
  attention: boolean;
  onSelect: () => void;
  onChange: (profile: Profile) => void;
  onLaunch: (
    project: ScopedProjectRef,
    defaults: NonNullable<ProfileSpace["newChatDefaults"]>,
  ) => Promise<void>;
  writeBlockReason: string | null;
}) {
  const disabled = writeBlockReason !== null;
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging, isOver } =
    useSortable({
      id: spaceDragId(profile.id, space.id),
      data: { kind: "space", profileId: profile.id, spaceId: space.id, label: space.name },
      disabled,
    });
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
      ref={setNodeRef}
      className="min-w-0 list-none"
      data-thread-selection-safe
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <div
        className={cn(
          "group/space relative h-18 overflow-hidden rounded-xl transition-colors",
          selected
            ? "bg-zinc-700 text-zinc-50 dark:bg-zinc-300 dark:text-zinc-900"
            : "bg-sidebar-foreground/5 text-sidebar-foreground hover:bg-sidebar-foreground/10",
          isOver && !isDragging && "ring-2 ring-inset ring-sidebar-foreground/50",
          isDragging && "opacity-30",
        )}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
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
              ref={setActivatorNodeRef}
              {...listeners}
              type="button"
              className="flex h-full w-full touch-none select-none flex-col items-start gap-0.5 px-2.5 py-2 pr-9 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
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
              writeBlockReason={writeBlockReason}
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
                    aria-label={`Space actions for ${space.name}`}
                    className={cn(
                      "absolute right-1 top-1 opacity-75 hover:opacity-100 group-hover/space:opacity-100 focus-visible:opacity-100 [--control-icon-color:currentColor]",
                      selected
                        ? "text-zinc-50 hover:bg-white/10 hover:text-zinc-50 dark:text-zinc-900 dark:hover:bg-black/10 dark:hover:text-zinc-900"
                        : "text-sidebar-muted-foreground",
                    )}
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" className={disabled ? "w-64" : "w-40"}>
                {writeBlockReason && (
                  <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
                    {writeBlockReason}
                  </p>
                )}
                <MenuItem
                  className="min-h-7 text-xs"
                  disabled={disabled}
                  onClick={() => setRenaming(true)}
                >
                  <PencilIcon className="size-3" />
                  Rename
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  className="min-h-7 text-xs"
                  variant="destructive"
                  disabled={disabled}
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
