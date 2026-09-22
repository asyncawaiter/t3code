import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  resolveShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../../keybindings";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { openChatCreation } from "../../chatCreationStore";
import {
  useComposerDraftStore,
  DraftId,
  finalizePromotedDraftThreadByRef,
} from "../../composerDraftStore";
import { threadShellHasStarted } from "../ChatView.logic";
import { useColumnNavigation } from "./columnNavigation";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useChatBoards } from "../../hooks/useChatBoards";
import { DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { useEffect, useMemo, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  XIcon,
  SearchIcon,
  LayersIcon,
  FolderIcon,
  LaptopIcon,
  Columns3Icon,
} from "lucide-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useEnvironments } from "../../state/environments";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { Button } from "../ui/button";
import { ChatPaneContext } from "../chat/ChatPaneContext";
import { useProjects } from "../../state/entities";
import { usePrimarySettings } from "../../hooks/useSettings";
import { indexProfileSpaces } from "@t3tools/contracts";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { Input } from "../ui/input";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
} from "../ui/menu";
import { Checkbox } from "../ui/checkbox";
import { openWorkItem } from "../../workItems";

type ColumnChat = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "projectId"
  | "title"
  | "createdAt"
  | "archivedAt"
  | "settledOverride"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "session"
> & { draftId?: DraftId };
const ChatView = lazy(() => import("../ChatView"));
const OptionalChatKey = Schema.NullOr(Schema.String);
const Layout = Schema.Struct({
  order: Schema.Array(Schema.String),
  hidden: Schema.Array(Schema.String),
  kept: Schema.Array(Schema.String),
});
export const columnWidth = (width: number) =>
  Math.max(340, Math.min(1000, Number.isFinite(width) ? width : 420));

const keyOf = (chat: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  `${chat.environmentId}:${chat.id}`;

export function columnOrder<
  T extends Pick<
    EnvironmentThreadShell,
    "environmentId" | "id" | "archivedAt" | "settledOverride" | "createdAt"
  >,
>(chats: readonly T[], layout: typeof Layout.Type) {
  const eligible = chats.filter(
    (chat) =>
      (!chat.archivedAt || layout.kept.includes(keyOf(chat))) &&
      !layout.hidden.includes(keyOf(chat)) &&
      (chat.settledOverride !== "settled" || layout.kept.includes(keyOf(chat))),
  );
  const byKey = new Map(eligible.map((chat) => [keyOf(chat), chat]));
  return [
    ...new Set([
      ...layout.order,
      ...eligible.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map(keyOf),
    ]),
  ].flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
}

export function boardColumnKeys(
  chats: Parameters<typeof columnOrder>[0],
  layout: typeof Layout.Type,
) {
  const visible = new Set(columnOrder(chats, layout).map(keyOf));
  const known = new Set(chats.map(keyOf));
  return layout.order.filter(
    (key) => !layout.hidden.includes(key) && (visible.has(key) || !known.has(key)),
  );
}

export default function ChatColumns({
  allChats: liveChats,
  focus,
}: {
  allChats: readonly EnvironmentThreadShell[];
  focus?: string | undefined;
}) {
  const state = useChatBoards();
  const { environments } = useEnvironments();
  const archiveDevices = useMemo(
    () =>
      environments
        .filter(
          (environment) =>
            environment.connection.phase === "connected" &&
            state.board.order.some(
              (key) =>
                key.startsWith(`${environment.environmentId}:`) &&
                !liveChats.some((chat) => keyOf(chat) === key),
            ),
        )
        .map((environment) => environment.environmentId),
    [environments, state.board.order, liveChats],
  );
  const archive = useArchivedThreadSnapshots(archiveDevices);
  const allChats = useMemo(
    () => [
      ...liveChats,
      ...archive.snapshots.flatMap(({ environmentId, snapshot }) =>
        snapshot.threads
          .map((shell) => ({ ...shell, environmentId }))
          .filter(
            (shell) =>
              state.board.order.includes(keyOf(shell)) &&
              !liveChats.some((chat) => keyOf(chat) === keyOf(shell)),
          ),
      ),
    ],
    [liveChats, archive.snapshots, state.board.order],
  );
  const drafts = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  useEffect(() => {
    for (const draft of Object.values(drafts)) {
      const key = `${draft.environmentId}:${draft.threadId}`;
      if (!state.board.order.includes(key)) continue;
      const shell = allChats.find((chat) => keyOf(chat) === key);
      if (threadShellHasStarted(shell))
        finalizePromotedDraftThreadByRef({
          environmentId: draft.environmentId,
          threadId: draft.threadId,
        });
    }
  }, [allChats, drafts, state.board.order]);
  const chats: readonly ColumnChat[] = useMemo(
    () => [
      ...allChats,
      ...Object.entries(drafts)
        .filter(
          ([, draft]) =>
            !draft.promotedTo &&
            !allChats.some(
              (chat) => chat.id === draft.threadId && chat.environmentId === draft.environmentId,
            ),
        )
        .map(([draftId, draft]) => ({
          environmentId: draft.environmentId,
          id: draft.threadId,
          projectId: draft.projectId,
          title: "New chat",
          createdAt: draft.createdAt,
          archivedAt: null,
          settledOverride: null,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          session: null,
          draftId: DraftId.make(draftId),
        })),
    ],
    [allChats, drafts],
  );
  return <BoardColumns key={state.board.id} state={state} allChats={chats} focus={focus} />;
}

function BoardColumns({
  state,
  allChats,
  focus,
}: {
  state: ReturnType<typeof useChatBoards>;
  allChats: readonly ColumnChat[];
  focus?: string | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { environments } = useEnvironments();
  const [focused, setFocused] = useLocalStorage(
    `t3.columns-focus.${state.board.id}`,
    null,
    OptionalChatKey,
  );
  const choosing = useColumnNavigation((state) => state.choosing);
  const layout = state.board;
  const widths = layout.widths;
  const disabled = state.pending || !!state.unavailable;
  const setLayout = (
    update: typeof Layout.Type | ((current: typeof Layout.Type) => typeof Layout.Type),
  ) => {
    void state.update({ ...layout, ...(typeof update === "function" ? update(layout) : update) });
  };
  const setWidths = (
    update: Record<string, number> | ((current: typeof widths) => Record<string, number>),
  ) => {
    void state.update({
      ...layout,
      widths: typeof update === "function" ? update(widths) : update,
    });
  };
  const candidates = useMemo(
    () => allChats.filter((chat) => layout.order.includes(keyOf(chat))),
    [allChats, layout.order],
  );
  const columns = useMemo(() => columnOrder(candidates, layout), [candidates, layout]);
  const createChat = () => {
    useColumnNavigation.setState({ choosing: false });
    openChatCreation({
      onCreated: async ({ threadId, projectRef }) => {
        const key = `${projectRef.environmentId}:${threadId}`;
        const saved = await state.update({
          ...layout,
          order: [...new Set([...layout.order, key])],
          hidden: layout.hidden.filter((item) => item !== key),
          labels: {
            ...layout.labels,
            [key]: {
              title: "New chat",
              context: `Unsent draft on ${environments.find((device) => device.environmentId === projectRef.environmentId)?.label ?? "another device"}`,
            },
          },
        });
        if (!saved)
          throw new Error(
            "The chat draft is saved, but could not be added to this board. Close this dialog and retry from Choose chats.",
          );
        setFocused(key);
        await navigate({
          to: "/spaces/$profileId",
          params: { profileId: "all" },
          search: { view: "columns", space: undefined, unsorted: false, focus: key },
          state: { dashboardReturn: location.state.dashboardReturn },
        });
      },
    });
  };
  const [boardName, setBoardName] = useState("");
  const [naming, setNaming] = useState<"rename" | "new" | "duplicate" | null>(null);
  const [profileFilter, setProfileFilter] = useState("all");
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [includeSettled, setIncludeSettled] = useState(false);
  const projects = useProjects();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const placements = useMemo(() => indexProfileSpaces(profiles), [profiles]);
  const detailsFor = (chat: ColumnChat) => {
    const placement = placements.get(keyOf(chat));
    const owner =
      placement?.profile ??
      profiles.find((profile) =>
        profile.projectKeys.includes(`${chat.environmentId}:${chat.projectId}`),
      );
    const folder = projects.find(
      (project) => project.environmentId === chat.environmentId && project.id === chat.projectId,
    );
    return {
      profileId: owner?.id ?? "unassigned",
      spaceId: placement ? `${placement.profile.id}:${placement.space.id}` : "unsorted",
      folderId: `${chat.environmentId}:${chat.projectId}`,
      profile: owner?.name ?? "Unassigned",
      space: placement?.space.name ?? "Unsorted",
      folder: folder?.title,
      path: folder?.workspaceRoot,
      device:
        environments.find((env) => env.environmentId === chat.environmentId)?.label ??
        "Offline device",
    };
  };
  const contextFor = (chat: ColumnChat) => {
    const detail = detailsFor(chat);
    return [
      detail.profile,
      detail.space,
      detail.folder !== detail.space ? detail.folder : null,
      detail.device,
    ]
      .filter(Boolean)
      .join(" / ");
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = columns.some((chat) => keyOf(chat) === focused)
    ? focused
    : columns[0]
      ? keyOf(columns[0])
      : null;
  const rail = useRef<HTMLDivElement>(null);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        choosing ||
        isCommandPaletteOpen() ||
        isModelPickerOpen() ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { terminalFocus: isTerminalFocused() },
      });
      if (command === "chat.new" || command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        createChat();
        return;
      }
      const jump = threadJumpIndexFromCommand(command ?? "");
      const direction = threadTraversalDirectionFromCommand(command);
      const index =
        jump ??
        (direction === null
          ? -1
          : columns.findIndex((chat) => keyOf(chat) === active) + (direction === "next" ? 1 : -1));
      const target = columns[index];
      if (!target) return;
      event.preventDefault();
      const key = keyOf(target);
      setFocused(key);
      if (expanded) setExpanded(key);
      else
        rail.current
          ?.querySelector(`[data-column-key="${CSS.escape(key)}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, choosing, columns, expanded, keybindings, setFocused, createChat]);
  const [savedScroll, setSavedScroll] = useLocalStorage(
    `t3.columns-scroll.${state.board.id}`,
    0,
    Schema.Finite,
  );
  const scroll = useRef(savedScroll);
  useLayoutEffect(() => {
    if (rail.current) rail.current.scrollLeft = expanded ? 0 : scroll.current;
  }, [expanded]);
  const appliedFocus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (focus && focus !== appliedFocus.current && columns.length && rail.current) {
      const node = rail.current.querySelector(`[data-column-key="${CSS.escape(focus)}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
        node.querySelector<HTMLButtonElement>("header button")?.focus({ preventScroll: true });
        appliedFocus.current = focus;
        setFocused(focus);
      }
    }
  }, [focus, columns, setFocused]);
  useEffect(() => () => setSavedScroll(scroll.current), [setSavedScroll]);
  function reorder(key: string, delta: number) {
    const visible = boardColumnKeys(allChats, layout);
    const index = visible.indexOf(key),
      target = index + delta;
    if (index < 0 || target < 0 || target >= visible.length) return;
    const order = [...layout.order];
    const from = order.indexOf(key),
      to = order.indexOf(visible[target]!);
    [order[from], order[to]] = [order[to]!, order[from]!];
    setLayout({ ...layout, order });
  }
  function selectBoard(id: string) {
    state.setSelected(id);
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: { view: "columns", unsorted: false, space: undefined },
      state: { dashboardReturn: location.state.dashboardReturn },
      replace: true,
    });
  }
  const selectedKeys = new Set(boardColumnKeys(allChats, layout));
  const choices = allChats
    .filter(
      (chat) =>
        !chat.archivedAt &&
        (includeSettled || chat.settledOverride !== "settled" || selectedKeys.has(keyOf(chat))),
    )
    .map((chat) => ({ chat, detail: detailsFor(chat) }))
    .filter(
      ({ chat, detail }) =>
        (profileFilter === "all" || detail.profileId === profileFilter) &&
        (spaceFilter === "all" || detail.spaceId === spaceFilter) &&
        (deviceFilter === "all" || chat.environmentId === deviceFilter) &&
        (folderFilter === "all" || detail.folderId === folderFilter) &&
        `${chat.title} ${Object.values(detail).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .toSorted(
      ({ chat: a }, { chat: b }) =>
        Number(a.settledOverride === "settled") - Number(b.settledOverride === "settled") ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 p-1.5 text-xs text-muted-foreground">
        <Select
          value={state.board.id}
          onValueChange={(value) => {
            if (value) selectBoard(value);
          }}
        >
          <SelectTrigger
            size="xs"
            aria-label="Columns board"
            className="max-w-64 border-transparent bg-transparent font-medium text-foreground"
          >
            <Columns3Icon className="size-3.5" />
            <SelectValue>{state.board.name}</SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {state.boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <span className="shrink-0 tabular-nums">{selectedKeys.size} chats</span>
        <Popover
          open={naming !== null}
          onOpenChange={(open) => {
            if (!open) setNaming(null);
          }}
        >
          <PopoverTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Manage boards"
                disabled={disabled}
              />
            }
            onClick={() => {
              setBoardName(state.board.name);
              setNaming("rename");
            }}
          >
            <MoreHorizontalIcon />
          </PopoverTrigger>
          <PopoverPopup className="w-72">
            <div className="flex gap-1 mb-3">
              {(["rename", "new", "duplicate"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={naming === mode ? "secondary" : "ghost"}
                  onClick={() => {
                    setNaming(mode);
                    setBoardName(
                      mode === "new"
                        ? ""
                        : mode === "duplicate"
                          ? `${state.board.name} copy`
                          : state.board.name,
                    );
                  }}
                >
                  {mode === "rename" ? "Rename" : mode === "new" ? "New board" : "Duplicate"}
                </Button>
              ))}
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!boardName.trim() || disabled) return;
                const next = {
                  ...(naming === "new" ? DEFAULT_CHAT_BOARD : layout),
                  id: naming === "rename" ? layout.id : crypto.randomUUID(),
                  name: boardName.trim(),
                };
                const saved =
                  naming === "rename" ? await state.update(next) : await state.save([next], []);
                if (saved) {
                  selectBoard(next.id);
                  setNaming(null);
                }
              }}
            >
              <Input
                aria-label="Board name"
                maxLength={100}
                value={boardName}
                onChange={(event) => setBoardName(event.target.value)}
                autoFocus
              />
              <div className="mt-3 flex justify-between gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={disabled || layout.id === "default"}
                  onClick={async () => {
                    if (await state.remove(layout)) {
                      selectBoard("default");
                      setNaming(null);
                    }
                  }}
                >
                  Delete board
                </Button>
                <Button size="xs" type="submit" disabled={disabled || !boardName.trim()}>
                  Save
                </Button>
              </div>
            </form>
          </PopoverPopup>
        </Popover>
        <div className="ml-auto flex items-center gap-2">
          <Button size="xs" variant="outline" disabled={disabled} onClick={createChat}>
            <PlusIcon className="size-3.5" />
            New chat
          </Button>
          <Button size="xs" variant="ghost" disabled={disabled} onClick={() => setWidths({})}>
            Equal widths
          </Button>
          <Sheet
            open={choosing}
            onOpenChange={(open) => useColumnNavigation.setState({ choosing: open })}
          >
            <SheetPopup
              side="left"
              showCloseButton={false}
              className="w-[min(26rem,calc(100vw-1rem))] max-w-none"
              backdropClassName="bg-black/10 backdrop-blur-none"
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <SheetTitle className="text-sm font-semibold">Choose chats</SheetTitle>
                    <span aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
                      {columns.length} on this board
                    </span>
                  </div>
                  <div className="relative">
                    <SearchIcon
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      size="compact"
                      className="[&_input]:pl-8"
                      aria-label="Find chats across Spaces"
                      placeholder="Search chats, spaces or devices..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Profile",
                        value: profileFilter,
                        set: (value: string) => {
                          setProfileFilter(value);
                          setSpaceFilter("all");
                        },
                        options: [{ id: "unassigned", name: "Unassigned" }, ...profiles],
                      },
                      {
                        label: "Space",
                        value: spaceFilter,
                        set: setSpaceFilter,
                        options: [
                          { id: "unsorted", name: "Unsorted" },
                          ...profiles
                            .filter(
                              (profile) => profileFilter === "all" || profile.id === profileFilter,
                            )
                            .flatMap((profile) =>
                              (profile.spaces ?? []).map((space) => ({
                                id: `${profile.id}:${space.id}`,
                                name:
                                  profileFilter === "all"
                                    ? `${profile.name} / ${space.name}`
                                    : space.name,
                              })),
                            ),
                        ],
                      },
                      {
                        label: "Device",
                        value: deviceFilter,
                        set: (value: string) => {
                          setDeviceFilter(value);
                          setFolderFilter("all");
                        },
                        options: environments.map((env) => ({
                          id: env.environmentId,
                          name: env.label,
                        })),
                      },
                      {
                        label: "Folder",
                        value: folderFilter,
                        set: setFolderFilter,
                        options: projects
                          .filter(
                            (project) =>
                              deviceFilter === "all" || project.environmentId === deviceFilter,
                          )
                          .map((project) => ({
                            id: `${project.environmentId}:${project.id}`,
                            name: project.title,
                          })),
                      },
                    ].map((filter) => (
                      <Select
                        key={filter.label}
                        value={filter.value}
                        onValueChange={(value) => filter.set(value ?? "all")}
                      >
                        <SelectTrigger size="xs" aria-label={`Choose chats: ${filter.label}`}>
                          <SelectValue>
                            {filter.value === "all"
                              ? `All ${filter.label.toLowerCase()}s`
                              : (filter.options.find((option) => option.id === filter.value)
                                  ?.name ?? filter.label)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectPopup alignItemWithTrigger={false}>
                          <SelectItem value="all">All {filter.label.toLowerCase()}s</SelectItem>
                          {filter.options.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    ))}
                  </div>
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={includeSettled} onCheckedChange={setIncludeSettled} />
                    Show settled chats
                  </label>
                </div>
                <div
                  className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5"
                  aria-label="Available chats"
                >
                  {choices.map(({ chat, detail }) => {
                    const key = keyOf(chat);
                    const visible = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5 hover:bg-accent/50 has-focus-visible:ring-2 has-focus-visible:ring-inset has-focus-visible:ring-ring ${visible ? "bg-primary/8" : ""}`}
                      >
                        <Checkbox
                          className="mt-0.5"
                          aria-label={chat.title}
                          checked={visible}
                          disabled={disabled}
                          onCheckedChange={(checked) => {
                            void state.update({
                              ...layout,
                              labels: {
                                ...layout.labels,
                                [key]: {
                                  title: chat.title.slice(0, 500),
                                  context: contextFor(chat).slice(0, 1500),
                                },
                              },
                              order: checked ? [...new Set([...layout.order, key])] : layout.order,
                              hidden: checked
                                ? layout.hidden.filter((id) => id !== key)
                                : [...new Set([...layout.hidden, key])],
                              kept:
                                checked && chat.settledOverride === "settled"
                                  ? [...new Set([...layout.kept, key])]
                                  : layout.kept,
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex items-start gap-2">
                            <span className="line-clamp-2 flex-1 text-xs font-medium leading-4 text-foreground">
                              {chat.title}
                            </span>
                            {chat.settledOverride === "settled" && (
                              <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                Settled
                              </span>
                            )}
                          </span>
                          <Tooltip>
                            <TooltipTrigger
                              render={<span tabIndex={0} className="block space-y-1" />}
                            >
                              <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                                <LayersIcon aria-hidden className="size-3 shrink-0" />
                                <span className="truncate">
                                  {detail.profile} / {detail.space}
                                </span>
                              </span>
                              <span className="flex min-w-0 items-center gap-3 text-[10px] leading-4 text-muted-foreground/80">
                                {detail.folder && detail.folder !== detail.space && (
                                  <span className="flex min-w-0 flex-1 items-center gap-1">
                                    <FolderIcon aria-hidden className="size-3 shrink-0" />
                                    <span className="truncate">{detail.folder}</span>
                                  </span>
                                )}
                                <span className="flex min-w-0 flex-1 items-center gap-1">
                                  <LaptopIcon aria-hidden className="size-3 shrink-0" />
                                  <span className="truncate">{detail.device}</span>
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipPopup className="max-w-xs text-xs">
                              <p>
                                {detail.profile} / {detail.space}
                              </p>
                              <p className="break-all">{detail.path ?? detail.folder}</p>
                              <p>{detail.device}</p>
                            </TooltipPopup>
                          </Tooltip>
                        </span>
                      </label>
                    );
                  })}
                  {!choices.length && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      {search.trim()
                        ? "No matching chats. Try another name or show settled chats."
                        : "No chats available."}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    Selections stay when you change filters.
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => useColumnNavigation.setState({ choosing: false })}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </SheetPopup>
          </Sheet>
        </div>
      </div>
      {(state.error || state.unavailable) && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {state.error ?? state.unavailable}
        </p>
      )}
      <div
        ref={rail}
        onScroll={(event) => {
          if (!expanded) scroll.current = event.currentTarget.scrollLeft;
        }}
        className="flex min-h-0 flex-1 snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
      >
        {[...selectedKeys].map((key) => {
          const chat = columns.find((chat) => keyOf(chat) === key);
          if (!chat) {
            if (allChats.some((chat) => keyOf(chat) === key)) return null;
            return (
              <section
                key={key}
                style={{ width: columnWidth(widths[key] ?? 420) }}
                className={`${expanded ? "hidden" : "flex"} shrink-0 flex-col rounded-xl border border-border p-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {layout.labels?.[key]?.title ?? "Chat unavailable"}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Remove unavailable chat"
                    disabled={disabled}
                    onClick={() => setLayout({ ...layout, hidden: [...layout.hidden, key] })}
                  >
                    <XIcon />
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  This chat is not available here yet. Connect its device, or send its first message
                  if it is still a draft.
                </p>
                <span className="mt-2 break-all text-[10px] text-muted-foreground">
                  {layout.labels?.[key]?.context ?? key}
                </span>
              </section>
            );
          }
          return (
            <Column
              key={key}
              chat={chat}
              context={contextFor(chat)}
              width={columnWidth(widths[key] ?? 420)}
              onResize={(width) =>
                disabled
                  ? Promise.resolve(false)
                  : state.update({ ...layout, widths: { ...widths, [key]: columnWidth(width) } })
              }
              resizeDisabled={disabled}
              active={active === key}
              expanded={expanded === key}
              hidden={expanded !== null && expanded !== key}
              onFocus={() => setFocused(key)}
              connected={environments.some(
                (env) =>
                  env.environmentId === chat.environmentId && env.connection.phase === "connected",
              )}
              device={
                environments.find((env) => env.environmentId === chat.environmentId)?.label ??
                "Offline device"
              }
            >
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Column options for ${chat.title}`}
                      disabled={disabled}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem
                    onClick={() =>
                      openWorkItem({
                        environmentId: chat.environmentId,
                        projectId: chat.projectId,
                        source: { environmentId: chat.environmentId, threadId: chat.id },
                      })
                    }
                  >
                    <PlusIcon />
                    Create task from this chat
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    disabled={[...selectedKeys][0] === key}
                    onClick={() => reorder(key, -1)}
                  >
                    <ArrowLeftIcon />
                    Move left
                  </MenuItem>
                  <MenuItem
                    disabled={[...selectedKeys].at(-1) === key}
                    onClick={() => reorder(key, 1)}
                  >
                    <ArrowRightIcon />
                    Move right
                  </MenuItem>
                  <MenuSeparator />
                  <MenuCheckboxItem
                    checked={layout.kept.includes(key)}
                    onCheckedChange={(checked) =>
                      setLayout((current) => ({
                        ...current,
                        kept: checked
                          ? [...new Set([...current.kept, key])]
                          : current.kept.filter((id) => id !== key),
                      }))
                    }
                  >
                    Keep on board when settled
                  </MenuCheckboxItem>
                </MenuPopup>
              </Menu>
              <Button
                size={expanded === key ? "xs" : "icon-xs"}
                variant="ghost"
                aria-label={expanded === key ? "Back to columns" : `Expand ${chat.title}`}
                onClick={() => {
                  setFocused(key);
                  setExpanded(expanded === key ? null : key);
                }}
              >
                {expanded === key ? (
                  <>
                    <Minimize2Icon />
                    <span>Back to columns</span>
                  </>
                ) : (
                  <Maximize2Icon />
                )}
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Hide ${chat.title} from columns`}
                disabled={disabled}
                onClick={() => {
                  setExpanded(null);
                  setLayout({ ...layout, hidden: [...layout.hidden, key] });
                }}
              >
                <XIcon />
              </Button>
            </Column>
          );
        })}
        {!selectedKeys.size && (
          <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
            Choose chats from any profile, space, or device. Enable Show settled chats to bring back
            a reference conversation.
          </p>
        )}
      </div>
    </div>
  );
}

function Column({
  chat,
  active,
  expanded,
  hidden,
  onFocus,
  device,
  connected,
  children,
  width,
  onResize,
  resizeDisabled,
  context,
}: {
  width: number;
  resizeDisabled: boolean;
  onResize: (width: number) => Promise<boolean>;
  context: string;
  chat: ColumnChat;
  active: boolean;
  expanded: boolean;
  hidden: boolean;
  onFocus: () => void;
  device: string;
  connected: boolean;
  children: React.ReactNode;
}) {
  const element = useRef<HTMLElement>(null);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      root: node.parentElement,
      threshold: 0.05,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      data-column-key={keyOf(chat)}
      ref={element}
      aria-label={`Chat column: ${chat.title}`}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      hidden={hidden}
      style={{ width: expanded ? "100%" : width }}
      className={`${hidden ? "hidden" : "flex"} relative min-h-0 shrink-0 snap-start flex-col overflow-hidden rounded-xl border ${active ? "border-primary/60 ring-1 ring-primary/20" : "border-border"}`}
    >
      <header className="flex flex-col gap-1 border-b border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onFocus}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
          >
            {chat.title}
          </button>
          <span className="text-[10px] text-muted-foreground">
            {!connected
              ? "Offline"
              : chat.hasPendingApprovals
                ? "Approval needed"
                : chat.hasPendingUserInput
                  ? "Answer needed"
                  : chat.session?.status === "running"
                    ? "Running"
                    : chat.archivedAt
                      ? "Archived"
                      : chat.settledOverride === "settled"
                        ? "Settled"
                        : "Idle"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            <Tooltip>
              <TooltipTrigger render={<span />}>{context}</TooltipTrigger>
              <TooltipPopup>{context}</TooltipPopup>
            </Tooltip>
          </span>
          {children}
        </div>
      </header>
      {!expanded && !resizeDisabled && (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={`Resize ${chat.title}`}
          aria-valuemin={340}
          aria-valuemax={1000}
          aria-valuenow={width}
          className="absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize touch-none hover:bg-primary/30 focus-visible:bg-primary/40"
          onDoubleClick={() => onResize(420)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onResize(width + (event.key === "ArrowRight" ? 20 : -20));
            }
            if (event.key === "Home") {
              event.preventDefault();
              onResize(340);
            }
            if (event.key === "End") {
              event.preventDefault();
              onResize(1000);
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            resize.current = { x: event.clientX, width };
          }}
          onPointerMove={(event) => {
            if (resize.current && element.current)
              element.current.style.width = `${columnWidth(resize.current.width + event.clientX - resize.current.x)}px`;
          }}
          onPointerUp={(event) => {
            if (resize.current) {
              const next = columnWidth(resize.current.width + event.clientX - resize.current.x);
              resize.current = null;
              void onResize(next).then((saved) => {
                if (!saved && element.current) element.current.style.width = `${width}px`;
              });
            }
          }}
          onLostPointerCapture={() => {
            if (resize.current && element.current) element.current.style.width = `${width}px`;
            resize.current = null;
          }}
        />
      )}
      <ChatPaneContext value={{ active: active && !hidden, column: !expanded }}>
        <div
          className={`flex min-h-0 flex-1 flex-col ${expanded ? "" : "[&_[data-chat-header]]:hidden"}`}
        >
          {!connected ? (
            <p className="p-4 text-sm text-muted-foreground">
              Reconnect {device} to load this conversation.
            </p>
          ) : visible && !hidden ? (
            <Suspense
              fallback={<p className="p-3 text-xs text-muted-foreground">Loading chat...</p>}
            >
              <ChatView
                environmentId={chat.environmentId}
                threadId={chat.id}
                {...(chat.draftId
                  ? { routeKind: "draft", draftId: chat.draftId }
                  : { routeKind: "server" })}
                reserveTitleBarControlInset={false}
              />
            </Suspense>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">{chat.title}</p>
          )}
        </div>
      </ChatPaneContext>
    </section>
  );
}
