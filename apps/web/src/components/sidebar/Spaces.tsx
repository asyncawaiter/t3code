import { useComposerDraftStore, composerDraftHasUserContent } from "../../composerDraftStore";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { SpaceLaunch } from "./SpaceLaunch";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PlusIcon,
  CheckIcon,
  XIcon,
  PencilIcon,
  MoreHorizontalIcon,
  InboxIcon,
  Layers3Icon,
  MessageSquareIcon,
  SquarePenIcon,
} from "lucide-react";
import {
  type Profile,
  type ProfileSpace,
  ALL_PROFILE_ID,
  spaceDeviceDefaults,
} from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { PreviewCard, PreviewCardTrigger, PreviewCardPopup } from "../ui/preview-card";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
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
  onSave: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-sidebar-border bg-sidebar-control-surface/50 px-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || saving || !name.trim()) return;
        setSaving(true);
        setError(null);
        void Promise.resolve()
          .then(() => onSave(name.trim()))
          .catch((cause: unknown) => {
            setError(
              cause instanceof Error ? cause.message : "Space could not be saved. Try again.",
            );
          })
          .finally(() => setSaving(false));
      }}
    >
      {error && (
        <span role="alert" className="w-full text-xs text-destructive">
          {error}
        </span>
      )}
      <Input
        autoFocus
        size="compact"
        aria-label={label}
        placeholder="Name this space"
        maxLength={48}
        value={name}
        disabled={disabled || saving}
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
        disabled={disabled || saving || !name.trim()}
      >
        <CheckIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Cancel space name"
        disabled={saving}
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
  onChange: (profile: Profile) => void | Promise<void>;
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
          className={cn(
            "h-6 gap-1 rounded-md px-2 text-[10px] ring-1 ring-inset",
            selectedSpaceId === null
              ? "bg-[color-mix(in_srgb,var(--sidebar-row-active)_85%,transparent)] text-sidebar-foreground ring-sidebar-border hover:bg-sidebar-row-active"
              : "text-sidebar-muted-foreground ring-transparent",
          )}
        >
          {selectedSpaceId === null && <CheckIcon aria-hidden className="size-3" />}
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
          onSave={async (name) => {
            if ((profile.spaces?.length ?? 0) >= 64) return;
            const id = randomUUID();
            await onChange({
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
  shortcut,
}: {
  profileId: string;
  dropDisabled: boolean;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onNewChat: () => void;
  shortcut?: string | null;
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
        "relative h-20 min-w-0 list-none rounded-xl",
        isOver && "ring-2 ring-sidebar-foreground/50",
      )}
      data-thread-selection-safe
    >
      <button
        type="button"
        aria-label="Open Unsorted chats, not assigned to a space"
        aria-description={`${count} active ${count === 1 ? "chat" : "chats"}${shortcut ? `, ${shortcut}` : ""}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "grid h-full w-full grid-rows-[1rem_minmax(0,1fr)_1rem] gap-1 rounded-xl px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          selected
            ? "bg-[color-mix(in_srgb,var(--sidebar-row-active)_85%,transparent)] text-sidebar-foreground ring-1 ring-inset ring-sidebar-border"
            : "bg-sidebar-foreground/5 text-sidebar-foreground hover:bg-sidebar-foreground/10",
        )}
      >
        <span className="flex items-center gap-1.5">
          <InboxIcon aria-hidden className="size-4" />
        </span>
        <span className="line-clamp-2 self-center break-words text-[13px] font-semibold leading-3.5 tracking-[-0.01em]">
          Unsorted
        </span>
        <span className="flex min-w-0 items-center gap-1.5 pr-5 text-[10px] tabular-nums text-sidebar-muted-foreground">
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex items-center gap-1" />}>
              <MessageSquareIcon aria-hidden className="size-3 shrink-0" />
              {count}
            </TooltipTrigger>
            <TooltipPopup>
              {count} active {count === 1 ? "chat" : "chats"}
            </TooltipPopup>
          </Tooltip>
          {shortcut && (
            <kbd className="ml-auto shrink-0 font-sans text-[9px] opacity-60">{shortcut}</kbd>
          )}
        </span>
      </button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="New chat in Unsorted"
        onClick={onNewChat}
        className={cn(
          "absolute bottom-1 right-1 [--control-icon-color:currentColor]",
          selected &&
            "text-sidebar-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
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
  projects,
  shortcut,
  onSelect,
  onChange,
  onLaunch,
  writeBlockReason,
}: {
  offerSetup?: boolean;
  profile: Profile;
  space: ProfileSpace;
  projects: ReadonlyArray<{
    key: string;
    project: ProjectFaviconProject | null;
    name: string;
    device: string;
  }>;
  shortcut?: string | null;
  count: number;
  selected: boolean;
  attention: boolean;
  onSelect: () => void;
  onChange: (profile: Profile) => void | Promise<void>;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const { active: dragging } = useDndContext();
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
          "group/space relative h-20 overflow-hidden rounded-xl transition-colors",
          selected
            ? "bg-[color-mix(in_srgb,var(--sidebar-row-active)_85%,transparent)] text-sidebar-foreground ring-1 ring-inset ring-sidebar-border"
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
            onSave={async (name) => {
              await onChange({
                ...profile,
                spaces: spaces.map((item) => (item.id === space.id ? { ...item, name } : item)),
              });
              setRenaming(false);
            }}
          />
        ) : (
          <>
            <PreviewCard
              open={previewOpen && !dragging && !launchOpen && !menuOpen && !renaming}
              onOpenChange={setPreviewOpen}
            >
              <PreviewCardTrigger
                delay={400}
                closeDelay={120}
                onPointerDown={() => setPreviewOpen(false)}
                render={
                  <button
                    ref={setActivatorNodeRef}
                    {...listeners}
                    type="button"
                    className="grid h-full w-full touch-none select-none grid-rows-[1rem_minmax(0,1fr)_1rem] gap-1 px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                    aria-label={`Open space ${space.name}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setPreviewOpen(false);
                      onSelect();
                    }}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                    aria-description={`${count} active chats${draftCount ? `, ${draftCount} drafts` : ""}${attention ? ", needs attention" : ""}${shortcut ? `, ${shortcut}` : ""}. Drag to reorder, or hold Alt and use arrow keys.`}
                    onKeyDown={(event) => {
                      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[
                        event.key
                      ];
                      if (offset === undefined) return;
                      event.preventDefault();
                      event.stopPropagation();
                      move(index + offset);
                    }}
                  />
                }
              >
                <span className="flex h-4 min-w-0 items-center gap-1 pr-5" aria-hidden="true">
                  {projects.length === 0 && <Layers3Icon className="size-3.5" />}
                  {projects
                    .slice(0, 3)
                    .map(({ key, project }) =>
                      project ? (
                        <ProjectFavicon key={key} project={project} className="size-3.5 shrink-0" />
                      ) : (
                        <Layers3Icon key={key} className="size-3.5 shrink-0 opacity-50" />
                      ),
                    )}
                  {projects.length > 3 && (
                    <span className="text-[9px] text-sidebar-muted-foreground">
                      +{projects.length - 3}
                    </span>
                  )}
                </span>
                <span className="min-w-0 self-center text-inherit">
                  <span className="line-clamp-2 break-words text-[13px] font-semibold leading-3.5 tracking-[-0.01em]">
                    {space.name}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1 pr-5 text-[10px] tabular-nums text-sidebar-muted-foreground">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5",
                      attention && "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    <MessageSquareIcon aria-hidden className="size-3 shrink-0" />
                    {count}
                  </span>
                  {draftCount > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <SquarePenIcon aria-hidden className="size-3 shrink-0" />
                      {draftCount}
                    </span>
                  )}
                  {attention ? <span className="sr-only">Needs you</span> : null}
                  {shortcut && (
                    <kbd className="ml-auto shrink-0 font-sans text-[9px] opacity-60">
                      {shortcut}
                    </kbd>
                  )}
                </span>
              </PreviewCardTrigger>
              <PreviewCardPopup
                side="right"
                align="start"
                className="w-72 max-w-[calc(100vw-2rem)] rounded-lg p-2.5 shadow-md"
                aria-label={`${space.name} details`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-xs font-semibold leading-4">{space.name}</div>
                    <div className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">
                      {projects.length} {projects.length === 1 ? "project" : "projects"} · {count}{" "}
                      active {count === 1 ? "chat" : "chats"}
                      {draftCount > 0 &&
                        ` · ${draftCount} ${draftCount === 1 ? "draft" : "drafts"}`}
                    </div>
                  </div>
                  {shortcut && (
                    <kbd className="shrink-0 rounded bg-muted/60 px-1 py-0.5 font-sans text-[9px] leading-3 text-muted-foreground">
                      {shortcut}
                    </kbd>
                  )}
                </div>
                {attention && (
                  <p className="mt-1.5 text-[10px] leading-3.5 text-amber-600 dark:text-amber-400">
                    Chats need your attention
                  </p>
                )}
                {projects.length > 0 ? (
                  <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto border-t border-border/60 pt-2">
                    {projects.map(({ key, project, name, device }) => (
                      <li key={key} className="flex items-start gap-2">
                        {project ? (
                          <ProjectFavicon project={project} className="mt-0.5 size-4 shrink-0" />
                        ) : (
                          <Layers3Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-[11px] font-medium leading-4">
                            {name}
                          </div>
                          <div className="break-words text-[10px] leading-3.5 text-muted-foreground">
                            {device}
                            {Object.values(spaceDeviceDefaults(space)).some(
                              (defaults) => defaults.projectKey === key,
                            ) && " · New chats"}
                          </div>
                          <div className="mt-0.5 break-all text-[10px] leading-3.5 text-muted-foreground/80">
                            {project?.workspaceRoot ??
                              Object.values(spaceDeviceDefaults(space)).find(
                                (defaults) => defaults.projectKey === key,
                              )?.workspaceRoot ??
                              "Project details unavailable on this device"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                    Add a chat or choose a project with + to get started.
                  </p>
                )}
              </PreviewCardPopup>
            </PreviewCard>
            <SpaceLaunch
              profile={profile}
              space={space}
              selected={selected}
              writeBlockReason={writeBlockReason}

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
                        ? "text-sidebar-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
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
