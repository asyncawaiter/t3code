import { useChatColumnMemory } from "../../hooks/useChatColumnLocation";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useWorkflowState } from "../../workflowState";
import { resolveRenameCommit } from "../chat/ChatHeader";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import { DashboardReviewBar } from "../dashboard/DashboardReviewBar";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { releaseComposerDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import { useSaveProfiles } from "../../hooks/useProfileSync";
import { moveThreadsToSpace, type ChatBoard } from "@t3tools/contracts";
import { toastManager } from "../ui/toast";
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
import { useColumnNavigation, spaceColumnsNavigation } from "./columnNavigation";
import { scoreChatPickerMatch } from "./chatPickerSearch";
import type { OverviewScope } from "../../lib/globalDashboardNavigation";
import { profileThreadFilter } from "@t3tools/client-runtime/state/profiles";
import { OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { useThreadActions } from "../../hooks/useThreadActions";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ChatBoard as ChatBoardSchema } from "@t3tools/contracts";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useChatBoards } from "../../hooks/useChatBoards";
import { DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { useEffect, useMemo, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import * as Schema from "effect/Schema";
import {
  GripVerticalIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  XIcon,
  SearchIcon,
  GitBranchIcon,
  MessageSquarePlusIcon,
  Columns3Icon,
  ChevronDownIcon,
  FolderIcon,
  LayersIcon,
  MonitorIcon,
  TerminalSquareIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
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
  | "hasActionableProposedPlan"
  | "session"
  | "latestTurn"
> &
  Partial<
    Pick<EnvironmentThreadShell, "branch" | "worktreePath" | "updatedAt" | "snoozedUntil">
  > & {
    draftId?: DraftId;
  };
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
  scope,
  boardId,
}: {
  scope?: OverviewScope | undefined;
  boardId?: string | undefined;
  allChats: readonly EnvironmentThreadShell[];
  focus?: string | undefined;
}) {
  const state = useChatBoards(boardId);
  const setSelected = state.setSelected;
  useEffect(() => {
    if (boardId) setSelected(boardId);
  }, [boardId, setSelected]);
  const { environments } = useEnvironments();
  const archiveDevices = useMemo(
    () =>
      environments
        .filter(
          (environment) =>
            environment.connection.phase === "connected" &&
            (scope ? (focus ? [focus] : []) : state.board.order).some(
              (key) =>
                key.startsWith(`${environment.environmentId}:`) &&
                !liveChats.some((chat) => keyOf(chat) === key),
            ),
        )
        .map((environment) => environment.environmentId),
    [environments, state.board.order, liveChats, scope, focus],
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
              (scope ? keyOf(shell) === focus : state.board.order.includes(keyOf(shell))) &&
              !liveChats.some((chat) => keyOf(chat) === keyOf(shell)),
          ),
      ),
    ],
    [liveChats, archive.snapshots, state.board.order, scope, focus],
  );
  const drafts = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  useEffect(() => {
    for (const draft of Object.values(drafts)) {
      const key = `${draft.environmentId}:${draft.threadId}`;
      if (!scope && !state.board.order.includes(key)) continue;
      const shell = allChats.find((chat) => keyOf(chat) === key);
      if (threadShellHasStarted(shell))
        finalizePromotedDraftThreadByRef({
          environmentId: draft.environmentId,
          threadId: draft.threadId,
        });
    }
  }, [allChats, drafts, state.board.order, scope]);
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
          hasActionableProposedPlan: false,
          session: null,
          latestTurn: null,
          draftId: DraftId.make(draftId),
        })),
    ],
    [allChats, drafts],
  );
  return scope ? (
    <SpaceColumns
      key={JSON.stringify(scope)}
      scope={scope}
      boards={state}
      allChats={chats}
      focus={focus}
    />
  ) : (
    <BoardColumns key={state.board.id} state={state} allChats={chats} focus={focus} />
  );
}

export function activeSpaceChats<
  T extends Pick<ColumnChat, "archivedAt" | "settledOverride" | "snoozedUntil">,
>(chats: readonly T[], now: number) {
  return chats.filter(
    (chat) =>
      !chat.archivedAt &&
      chat.settledOverride !== "settled" &&
      !(chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now),
  );
}

function SpaceColumns({
  scope,
  boards,
  allChats,
  focus,
}: {
  scope: OverviewScope;
  boards: ReturnType<typeof useChatBoards>;
  allChats: readonly ColumnChat[];
  focus?: string | undefined;
}) {
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const matches = profileThreadFilter(
    profiles,
    scope.profileId,
    scope.unsorted ? OUTSIDE_SPACES : (scope.spaceId ?? null),
  );
  const scoped = allChats.filter((chat) => matches({ ...chat, pinnedAt: null }));
  const id = `space:${scope.profileId}:${scope.spaceId ?? (scope.unsorted ? "unsorted" : "all")}`;
  const initial = useMemo(() => ({ ...DEFAULT_CHAT_BOARD, id }), [id]);
  const [arrangement, setArrangement] = useLocalStorage(
    `t3.space-columns.${id}`,
    initial,
    ChatBoardSchema,
  );
  const [references, setReferences] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const next = Math.min(
      ...scoped.flatMap((chat) =>
        chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now
          ? [Date.parse(chat.snoozedUntil)]
          : [],
      ),
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(0, next - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [scoped, now]);
  const active = activeSpaceChats(scoped, now);
  const activeKeys = new Set(active.map(keyOf));
  const resumedReferences = references.filter((key) => activeKeys.has(key));
  useEffect(() => {
    if (resumedReferences.length)
      setReferences((current) => current.filter((key) => !resumedReferences.includes(key)));
  }, [resumedReferences]);
  const eligible = scoped.filter(
    (chat) => activeKeys.has(keyOf(chat)) || references.includes(keyOf(chat)),
  );
  const eligibleKeys = new Set(eligible.map(keyOf));
  const order = [
    ...new Set([
      ...arrangement.order.filter((key) => eligibleKeys.has(key)),
      ...eligible.map(keyOf),
    ]),
  ];
  const appliedSpaceFocus = useRef<string | undefined>(undefined);
  const focusRequest = useLocation({
    select: (location) => `${focus}:${location.state.columnFocusRequest ?? ""}`,
  });
  const focusAvailable = scoped.some((chat) => keyOf(chat) === focus);
  const focusActive = active.some((chat) => keyOf(chat) === focus);
  useEffect(() => {
    if (!focus || !focusAvailable || appliedSpaceFocus.current === focusRequest) return;
    appliedSpaceFocus.current = focusRequest;
    setArrangement((current) => ({
      ...current,
      hidden: current.hidden.filter((key) => key !== focus),
    }));
    if (!focusActive)
      setReferences((current) => (current.includes(focus) ? current : [...current, focus]));
  }, [focus, focusRequest, focusAvailable, focusActive, setArrangement]);
  const board = { ...arrangement, id, order, kept: references };
  return (
    <BoardColumns
      scope={scope}
      now={now}
      state={{
        ...boards,
        board,
        pending: false,
        unavailable: null,
        error: null,
        update: async (next) => {
          setReferences([...next.kept]);
          setArrangement({ ...next, kept: [] });
          return true;
        },
      }}
      allChats={scoped}
      focus={focus}
    />
  );
}

export function addChatsToBoard(
  board: ChatBoard,
  additions: readonly { key: string; title: string; context: string; settled: boolean }[],
): ChatBoard {
  if (!additions.length) return board;
  const keys = new Set(additions.map((chat) => chat.key));
  return {
    ...board,
    order: [...board.order.filter((key) => !keys.has(key)), ...keys],
    hidden: board.hidden.filter((key) => !keys.has(key)),
    kept: [
      ...new Set([
        ...board.kept,
        ...additions.filter((chat) => chat.settled).map((chat) => chat.key),
      ]),
    ],
    labels: {
      ...board.labels,
      ...Object.fromEntries(
        additions.map((chat) => [
          chat.key,
          { title: chat.title.slice(0, 500), context: chat.context.slice(0, 1500) },
        ]),
      ),
    },
  };
}

function BoardColumns({
  state,
  allChats,
  focus,
  scope,
  now = 0,
}: {
  now?: number;
  scope?: OverviewScope | undefined;
  state: ReturnType<typeof useChatBoards>;
  allChats: readonly ColumnChat[];
  focus?: string | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { remember } = useChatColumnMemory();
  const rememberUse = (key: string) =>
    remember(
      key,
      scope
        ? { kind: "space", ...scope }
        : { kind: "board", boardId: state.board.id, boardName: state.board.name },
    );
  const { unsettleThread, unsnoozeThread } = useThreadActions();
  const [spacePicker, setSpacePicker] = useState<"settled" | "hidden" | "snoozed" | null>(null);
  const [spaceSearch, setSpaceSearch] = useState("");
  const [resuming, setResuming] = useState<string | null>(null);
  const openFocus = (key: string) => {
    const target = scope
      ? spaceColumnsNavigation(scope, key)
      : {
          to: "/spaces/$profileId" as const,
          params: { profileId: "all" },
          search: {
            view: "columns" as const,
            workspace: "board" as const,
            board: state.board.id,
            space: undefined,
            unsorted: false,
            focus: key,
          },
        };
    void navigate({
      ...target,
      state: (previous) => ({
        dashboardReturn: location.state.dashboardReturn,
        columnFocusRequest: (previous.columnFocusRequest ?? 0) + 1,
      }),
      replace: true,
    });
  };
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
  // A located reference remains visible without changing its state or saved membership.
  const visibleLayout = useMemo(
    () =>
      focus && layout.order.includes(focus)
        ? { ...layout, kept: [...new Set([...layout.kept, focus])] }
        : layout,
    [layout, focus],
  );
  const columns = useMemo(
    () => columnOrder(candidates, visibleLayout),
    [candidates, visibleLayout],
  );
  const createChat = () => {
    useColumnNavigation.setState({ choosing: false });
    openChatCreation({
      ...(scope ? { scope } : {}),
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
            "The chat draft is saved, but could not be added to this board. Close this dialog and retry from Add existing chat.",
          );
        rememberUse(key);
        setFocused(key);
        openFocus(key);
      },
    });
  };
  const saveProfiles = useSaveProfiles();
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [naming, setNaming] = useState<"rename" | "new" | "duplicate" | null>(null);
  const [profileFilter, setProfileFilter] = useState("all");
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingChats, setPendingChats] = useState<string[]>([]);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const reviewedResults = useWorkflowState((state) => state.reviewed);
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
      path: chat.worktreePath ?? folder?.workspaceRoot,
      device:
        environments.find((env) => env.environmentId === chat.environmentId)?.label ??
        "Offline device",
    };
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
      rememberUse(key);
      setFocused(key);
      if (expanded) setExpanded(key);
      openFocus(key);
      if (!expanded)
        rail.current
          ?.querySelector(`[data-column-key="${CSS.escape(key)}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    active,
    choosing,
    columns,
    expanded,
    keybindings,
    setFocused,
    createChat,
    rememberUse,
    openFocus,
  ]);
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
  const focusRequest = `${focus}:${location.state.columnFocusRequest ?? ""}`;
  useLayoutEffect(() => {
    if (focus && focusRequest !== appliedFocus.current && columns.length && rail.current) {
      if (expanded && expanded !== focus) {
        setExpanded(null);
        return;
      }
      const node = rail.current.querySelector(`[data-column-key="${CSS.escape(focus)}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
        node.querySelector<HTMLButtonElement>("header button")?.focus({ preventScroll: true });
        appliedFocus.current = focusRequest;
        setFocused(focus);
      }
    }
  }, [focus, focusRequest, columns, expanded, setFocused]);
  useEffect(() => () => setSavedScroll(scroll.current), [setSavedScroll]);
  const [draggingColumn, setDraggingColumn] = useState(false);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  function reorder(key: string, delta: number) {
    const visible = boardColumnKeys(allChats, visibleLayout);
    const index = visible.indexOf(key),
      target = index + delta;
    if (index < 0 || target < 0 || target >= visible.length) return;
    setLayout({ ...layout, order: moveColumn(layout.order, key, visible[target]!) });
  }
  function selectBoard(id: string) {
    state.setSelected(id);
    void navigate({
      to: "/spaces/$profileId",
      params: { profileId: "all" },
      search: { view: "columns", workspace: "board", board: id, unsorted: false, space: undefined },
      state: { dashboardReturn: location.state.dashboardReturn },
      replace: true,
    });
  }
  const selectedKeys = new Set(boardColumnKeys(allChats, visibleLayout));
  const resetPickerFilters = () => {
    setProfileFilter("all");
    setSpaceFilter("all");
    setDeviceFilter("all");
    setFolderFilter("all");
    setIncludeSettled(false);
  };
  const filtersChanged =
    profileFilter !== "all" ||
    spaceFilter !== "all" ||
    deviceFilter !== "all" ||
    folderFilter !== "all" ||
    includeSettled;
  const pendingAdditions = pendingChats.flatMap((key) => {
    const chat = allChats.find(
      (item) => keyOf(item) === key && !item.archivedAt && !selectedKeys.has(key),
    );
    if (!chat) return [];
    const detail = detailsFor(chat);
    return [
      {
        key,
        title: chat.title,
        context: [detail.profile, detail.space, detail.folder, detail.device]
          .filter(Boolean)
          .join(" / "),
        settled: chat.settledOverride === "settled",
      },
    ];
  });
  const addSelectedChats = async () => {
    if (disabled || !pendingAdditions.length) return;
    if (!(await state.update(addChatsToBoard(layout, pendingAdditions)))) return;
    const first = pendingAdditions[0]!.key;
    rememberUse(first);
    setPendingChats([]);
    setExpanded(null);
    appliedFocus.current = undefined;
    setFocused(first);
    useColumnNavigation.setState({ choosing: false });
    openFocus(first);
  };
  const choices = allChats
    .filter(
      (chat) =>
        !chat.archivedAt &&
        (search.trim() !== "" || !selectedKeys.has(keyOf(chat))) &&
        (includeSettled || chat.settledOverride !== "settled" || selectedKeys.has(keyOf(chat))),
    )
    .map((chat) => {
      const detail = detailsFor(chat);
      const score = scoreChatPickerMatch(
        chat.title,
        [detail.profile, detail.space, detail.folder, detail.device],
        search,
      );
      return { chat, detail, score: score ?? 0, matches: !search.trim() || score !== null };
    })
    .filter(
      ({ chat, detail, matches }) =>
        matches &&
        (profileFilter === "all" || detail.profileId === profileFilter) &&
        (spaceFilter === "all" || detail.spaceId === spaceFilter) &&
        (deviceFilter === "all" || chat.environmentId === deviceFilter) &&
        (folderFilter === "all" || detail.folderId === folderFilter),
    )
    .toSorted(
      (a, b) =>
        Number(selectedKeys.has(keyOf(a.chat))) - Number(selectedKeys.has(keyOf(b.chat))) ||
        a.score - b.score ||
        (b.chat.updatedAt ?? b.chat.createdAt).localeCompare(a.chat.updatedAt ?? a.chat.createdAt),
    );
  const spaceChoices = allChats.filter(
    (chat) =>
      !chat.archivedAt &&
      chat.title.toLowerCase().includes(spaceSearch.toLowerCase()) &&
      (spacePicker === "hidden"
        ? layout.hidden.includes(keyOf(chat))
        : spacePicker === "settled"
          ? chat.settledOverride === "settled"
          : !!chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 p-1.5 text-xs text-muted-foreground">
        {!scope && (
          <>
            {state.boards.length > 1 ? (
              <Popover open={boardPickerOpen} onOpenChange={setBoardPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label="Choose a saved board"
                      className="max-w-64"
                    />
                  }
                >
                  <Columns3Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{state.board.name}</span>
                  <ChevronDownIcon className="size-3 shrink-0" />
                </PopoverTrigger>
                <PopoverPopup align="start" className="w-64 max-h-80 overflow-y-auto p-1">
                  <div className="flex flex-col gap-1" aria-label="Saved boards">
                    {state.boards.map((board) => (
                      <Button
                        key={board.id}
                        size="xs"
                        variant={state.board.id === board.id ? "secondary" : "ghost"}
                        className="h-8 justify-between rounded-sm px-2 text-xs"
                        aria-pressed={state.board.id === board.id}
                        onClick={() => {
                          selectBoard(board.id);
                          setBoardPickerOpen(false);
                        }}
                      >
                        <span className="truncate">{board.name}</span>
                        <span className="text-muted-foreground">
                          {board.order.filter((key) => !board.hidden.includes(key)).length}{" "}
                          {board.order.filter((key) => !board.hidden.includes(key)).length === 1
                            ? "chat"
                            : "chats"}
                        </span>
                      </Button>
                    ))}
                  </div>
                </PopoverPopup>
              </Popover>
            ) : (
              <span className="flex items-center gap-1.5 px-2 font-medium text-foreground">
                <Columns3Icon className="size-3.5" />
                {state.board.name}
              </span>
            )}
            <span className="shrink-0 tabular-nums">{selectedKeys.size} chats</span>
            <Dialog
              open={naming !== null}
              onOpenChange={(open) => {
                if (!open) setNaming(null);
              }}
            >
              <DialogTrigger
                render={
                  <Button
                    size="xs"
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
                Manage
              </DialogTrigger>
              <DialogPopup className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Manage boards</DialogTitle>
                </DialogHeader>
                <DialogPanel>
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
                        naming === "rename"
                          ? await state.update(next)
                          : await state.save([next], []);
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
                </DialogPanel>
              </DialogPopup>
            </Dialog>
          </>
        )}
        {scope && (
          <span className="px-2 font-medium text-foreground">
            {
              columns.filter(
                (chat) =>
                  chat.settledOverride !== "settled" &&
                  !(chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now),
              ).length
            }{" "}
            active
            {columns.some((chat) => layout.kept.includes(keyOf(chat)))
              ? ` · ${columns.filter((chat) => layout.kept.includes(keyOf(chat))).length} reference${columns.filter((chat) => layout.kept.includes(keyOf(chat))).length === 1 ? "" : "s"}`
              : ""}
          </span>
        )}
        <Button size="xs" variant="ghost" disabled={disabled} onClick={() => setWidths({})}>
          Reset widths
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          {scope &&
            (["hidden", "snoozed", "settled"] as const).map((kind) => {
              const count = allChats.filter((chat) =>
                kind === "hidden"
                  ? layout.hidden.includes(keyOf(chat))
                  : kind === "settled"
                    ? chat.settledOverride === "settled"
                    : !!chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now,
              ).length;
              return (
                <Button
                  key={kind}
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSpacePicker(kind);
                    setSpaceSearch("");
                  }}
                >
                  {kind === "hidden" ? "Hidden" : kind === "settled" ? "Settled" : "Snoozed"}{" "}
                  {count}
                </Button>
              );
            })}
          {!scope && (
            <>
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={choosing}
                onClick={() => {
                  setPendingChats([]);
                  setSearch("");
                  resetPickerFilters();
                  useColumnNavigation.setState({ choosing: true });
                }}
              >
                <PlusIcon className="size-3.5" />
                Add existing chat
              </Button>
            </>
          )}
          <Button size="xs" variant="outline" disabled={disabled} onClick={createChat}>
            <MessageSquarePlusIcon className="size-3.5" />
            New chat
          </Button>
          <Dialog
            open={choosing}
            onOpenChange={(open) => {
              if (state.pending) return;
              if (!open) setPendingChats([]);
              useColumnNavigation.setState({ choosing: open });
            }}
          >
            <DialogPopup
              initialFocus={pickerSearchRef}
              bottomStickOnMobile={false}
              className="flex h-[min(42rem,85dvh)] w-[min(50rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0"
              backdropClassName="bg-black/15 backdrop-blur-none"
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <DialogTitle className="text-base font-semibold">
                      Add existing chats
                    </DialogTitle>
                    <span aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
                      {selectedKeys.size} on this board
                    </span>
                  </div>
                  <div className="relative">
                    <SearchIcon
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      ref={pickerSearchRef}
                      size="compact"
                      className="[&_input]:pl-8"
                      aria-label="Find chats across Spaces"
                      placeholder="Search by title, space, project or device..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                    {[
                      {
                        label: "Profile",
                        value: profileFilter,
                        set: (value: string) => {
                          setProfileFilter(value);
                          setSpaceFilter("all");
                          setFolderFilter("all");
                        },
                        options: [{ id: "unassigned", name: "Unassigned" }, ...profiles],
                      },
                      {
                        label: "Space",
                        value: spaceFilter,
                        set: (value: string) => {
                          setSpaceFilter(value);
                          setFolderFilter("all");
                        },
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
                              (deviceFilter === "all" || project.environmentId === deviceFilter) &&
                              allChats.some((chat) => {
                                const detail = detailsFor(chat);
                                return (
                                  detail.folderId === `${project.environmentId}:${project.id}` &&
                                  (profileFilter === "all" || detail.profileId === profileFilter) &&
                                  (spaceFilter === "all" || detail.spaceId === spaceFilter)
                                );
                              }),
                          )
                          .map((project) => ({
                            id: `${project.environmentId}:${project.id}`,
                            name: project.title,
                          })),
                      },
                    ].map((filter) => (
                      <div
                        key={filter.label}
                        className={
                          filter.label === "Device"
                            ? "sm:border-l sm:border-border/60 sm:pl-3"
                            : undefined
                        }
                      >
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {filter.label}
                        </div>
                        <Select
                          value={filter.value}
                          onValueChange={(value) => filter.set(value ?? "all")}
                        >
                          <SelectTrigger
                            size="xs"
                            className={
                              filter.value !== "all"
                                ? "border-primary/40 bg-primary/8 text-foreground"
                                : undefined
                            }
                            aria-label={`Find chats: ${filter.label}`}
                          >
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
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs ${includeSettled ? "bg-primary/8 text-foreground" : "text-muted-foreground"}`}
                    >
                      <Checkbox checked={includeSettled} onCheckedChange={setIncludeSettled} />
                      Include settled chats
                    </label>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!filtersChanged}
                      onClick={resetPickerFilters}
                    >
                      Reset filters
                    </Button>
                  </div>
                  {includeSettled && (
                    <p className="text-xs text-muted-foreground">
                      Settled chats you add will stay on this board as references.
                    </p>
                  )}
                </div>
                <div
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2"
                  aria-label="Available chats"
                >
                  {choices.map(({ chat, detail }) => {
                    const key = keyOf(chat);
                    const alreadyAdded = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-0 has-focus-visible:ring-2 has-focus-visible:ring-inset has-focus-visible:ring-ring ${alreadyAdded ? "opacity-60" : "cursor-pointer hover:bg-accent/40"} ${pendingChats.includes(key) ? "bg-primary/8" : ""}`}
                      >
                        <Checkbox
                          aria-labelledby={`picker-chat-${key}`}
                          checked={alreadyAdded || pendingChats.includes(key)}
                          disabled={alreadyAdded || disabled}
                          onCheckedChange={(checked) =>
                            setPendingChats((current) =>
                              checked
                                ? [...new Set([...current, key])]
                                : current.filter((id) => id !== key),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            id={`picker-chat-${key}`}
                            className="block truncate text-sm font-medium text-foreground"
                          >
                            {chat.title}
                          </span>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="mt-1 block truncate text-xs text-muted-foreground" />
                              }
                            >
                              {detail.space} · {detail.folder ?? "No project"} · {detail.device}
                            </TooltipTrigger>
                            <TooltipPopup>
                              {detail.profile} / {detail.space} / {detail.folder} / {detail.device}
                            </TooltipPopup>
                          </Tooltip>
                        </span>
                        <span className="shrink-0 space-y-1 text-right text-[11px] text-muted-foreground">
                          <span className="block">
                            {alreadyAdded
                              ? "Already added"
                              : columnStatus(chat, reviewedResults[key])}
                          </span>
                          <time className="block" dateTime={chat.updatedAt ?? chat.createdAt}>
                            {formatRelativeTimeLabel(chat.updatedAt ?? chat.createdAt)}
                          </time>
                        </span>
                      </label>
                    );
                  })}
                  {!choices.length && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      {search.trim()
                        ? "No matching chats. Try another name or show settled chats."
                        : "No chats available to add. Try other filters or include settled chats."}
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-border/60 bg-muted/15 px-4 py-3">
                  {(state.error || state.unavailable) && (
                    <p role="alert" className="mb-2 text-xs text-destructive">
                      {state.error ?? state.unavailable}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
                      <span className="font-medium text-foreground">
                        {pendingAdditions.length} selected
                      </span>
                      {pendingAdditions.length > 0 && (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={state.pending}
                          onClick={() => setPendingChats([])}
                        >
                          Clear
                        </Button>
                      )}
                      <p className="mt-1">Selections stay when you search or filter.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={state.pending}
                        onClick={() => {
                          setPendingChats([]);
                          useColumnNavigation.setState({ choosing: false });
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={disabled || !pendingAdditions.length}
                        onClick={() => void addSelectedChats()}
                      >
                        {state.pending
                          ? "Adding..."
                          : `Add ${pendingAdditions.length || ""} ${pendingAdditions.length === 1 ? "chat" : "chats"}`}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </DialogPopup>
          </Dialog>
        </div>
      </div>
      {(state.error || state.unavailable) && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {state.error ?? state.unavailable}
        </p>
      )}
      <Dialog
        open={spacePicker !== null}
        onOpenChange={(open) => {
          if (!open && !resuming) setSpacePicker(null);
        }}
      >
        <DialogPopup className="max-h-[min(36rem,80dvh)] max-w-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {spacePicker === "settled"
                ? "Settled chats"
                : spacePicker === "hidden"
                  ? "Hidden chats"
                  : "Snoozed chats"}
            </DialogTitle>
            <DialogDescription>
              {spacePicker === "hidden"
                ? "Chats hidden from this workspace. Show one to restore its column."
                : spacePicker === "snoozed"
                  ? "Wake a chat to return it to active work, or open it as a reference."
                  : "Resume a chat to return it to active work, or open it as a reference."}
            </DialogDescription>
          </DialogHeader>
          <div className="shrink-0 px-6 pb-3">
            <Input
              size="compact"
              type="search"
              aria-label="Search this space"
              placeholder="Search this space..."
              value={spaceSearch}
              onChange={(event) => setSpaceSearch(event.target.value)}
            />
          </div>
          <DialogPanel className="pt-1! pb-4" scrollFade={false}>
            <div className="divide-y divide-border/60">
              {spaceChoices.map((chat) => {
                const key = keyOf(chat);
                const open = async (resume: boolean) => {
                  setResuming(key);
                  try {
                    if (resume) {
                      const result =
                        spacePicker === "snoozed"
                          ? await unsnoozeThread(scopeThreadRef(chat.environmentId, chat.id))
                          : await unsettleThread(scopeThreadRef(chat.environmentId, chat.id));
                      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                    }
                    await state.update({
                      ...layout,
                      hidden: layout.hidden.filter((item) => item !== key),
                      kept:
                        !resume && (chat.settledOverride === "settled" || !!chat.snoozedUntil)
                          ? [...new Set([...layout.kept, key])]
                          : layout.kept.filter((item) => item !== key),
                    });
                    setExpanded(null);
                    appliedFocus.current = undefined;
                    setFocused(key);
                    openFocus(key);
                    setSpacePicker(null);
                  } catch (error) {
                    toastManager.add({
                      type: "error",
                      title: "Could not open chat",
                      description: error instanceof Error ? error.message : "Try again.",
                    });
                  } finally {
                    setResuming(null);
                  }
                };
                return (
                  <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <span className="min-w-32 flex-1 break-words text-sm font-medium">
                      {chat.title}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!!resuming}
                      onClick={() => void open(false)}
                    >
                      {spacePicker === "hidden" ? "Show chat" : "Open as reference"}
                    </Button>
                    {spacePicker !== "hidden" && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!!resuming}
                        onClick={() => void open(true)}
                      >
                        {spacePicker === "snoozed" ? "Wake chat" : "Resume chat"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {!spaceChoices.length && (
              <div
                role="status"
                className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center"
              >
                <p className="text-sm font-medium">
                  {spaceSearch.trim()
                    ? "No matching chats"
                    : spacePicker === "hidden"
                      ? "No hidden chats"
                      : spacePicker === "snoozed"
                        ? "No snoozed chats"
                        : "No settled chats"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {spaceSearch.trim()
                    ? "Try a different search."
                    : "Chats in this state will appear here."}
                </p>
              </div>
            )}
          </DialogPanel>
          <DialogFooter className="sm:justify-start">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {spacePicker === "hidden"
                ? "Showing a chat does not change its status."
                : "References keep their settled or snoozed status."}{" "}
              Only chats in this workspace are shown.
            </p>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <DndContext
        sensors={dragSensors}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Drag to move the column, or press Left or Right to move it one position.",
          },
        }}
        onDragStart={() => setDraggingColumn(true)}
        onDragCancel={() => setDraggingColumn(false)}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={({ active, over }) => {
          setDraggingColumn(false);
          if (disabled || expanded || !over || active.id === over.id) return;
          setLayout((current) => ({
            ...current,
            order: moveColumn(current.order, String(active.id), String(over.id)),
          }));
        }}
      >
        <SortableContext items={[...selectedKeys]} strategy={horizontalListSortingStrategy}>
          <div
            ref={rail}
            onScroll={(event) => {
              if (!expanded) scroll.current = event.currentTarget.scrollLeft;
            }}
            className={`flex min-h-0 flex-1 ${draggingColumn ? "" : "snap-x snap-proximity"} gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]`}
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
                        aria-label="Remove unavailable chat from board"
                        disabled={disabled}
                        onClick={() => setLayout({ ...layout, hidden: [...layout.hidden, key] })}
                      >
                        <XIcon />
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      This chat is not available here yet. Connect its device, or send its first
                      message if it is still a draft.
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
                  context={detailsFor(chat)}
                  width={columnWidth(widths[key] ?? 420)}
                  onResize={(width) =>
                    disabled
                      ? Promise.resolve(false)
                      : state.update({
                          ...layout,
                          widths: { ...widths, [key]: columnWidth(width) },
                        })
                  }
                  resizeDisabled={disabled}
                  onMove={(delta) => reorder(key, delta)}
                  active={active === key}
                  expanded={expanded === key}
                  hidden={expanded !== null && expanded !== key}
                  onFocus={() => setFocused(key)}
                  onUse={() => rememberUse(key)}
                  connected={environments.some(
                    (env) =>
                      env.environmentId === chat.environmentId &&
                      env.connection.phase === "connected",
                  )}
                  columnActions={
                    <>
                      {chat.draftId && (
                        <>
                          <MenuItem
                            disabled={disabled}
                            onClick={() => {
                              if (!chat.draftId) return;
                              openChatCreation({
                                draftId: chat.draftId,
                                projectRef: scopeProjectRef(chat.environmentId, chat.projectId),
                              });
                            }}
                          >
                            Move draft
                          </MenuItem>
                          <MenuItem
                            variant="destructive"
                            disabled={disabled}
                            onClick={async () => {
                              if (!chat.draftId) return;
                              const api = readLocalApi();
                              if (
                                !api ||
                                !(await api.dialogs.confirm(
                                  "Discard this unsent draft and its attachments?",
                                ))
                              )
                                return;
                              try {
                                if (
                                  !(await state.update({
                                    ...layout,
                                    hidden: [...new Set([...layout.hidden, key])],
                                  }))
                                )
                                  return;
                                await saveProfiles((profiles) =>
                                  profiles.map((profile) =>
                                    moveThreadsToSpace(
                                      profile,
                                      [
                                        {
                                          threadKey: key,
                                          projectKey: `${chat.environmentId}:${chat.projectId}`,
                                        },
                                      ],
                                      null,
                                    ),
                                  ),
                                );
                                releaseComposerDraftUploads(chat.draftId);
                                useComposerDraftStore.getState().clearDraftThread(chat.draftId);
                              } catch (error) {
                                toastManager.add({
                                  type: "error",
                                  title: "Draft not discarded",
                                  description:
                                    error instanceof Error ? error.message : "Try again.",
                                });
                              }
                            }}
                          >
                            Discard draft
                          </MenuItem>
                          <MenuSeparator />
                        </>
                      )}
                      <MenuItem
                        disabled={disabled || [...selectedKeys][0] === key}
                        onClick={() => reorder(key, -1)}
                      >
                        <ArrowLeftIcon />
                        Move left
                      </MenuItem>
                      <MenuItem
                        disabled={disabled || [...selectedKeys].at(-1) === key}
                        onClick={() => reorder(key, 1)}
                      >
                        <ArrowRightIcon />
                        Move right
                      </MenuItem>
                      <MenuSeparator />
                      {!scope && (
                        <MenuCheckboxItem
                          disabled={disabled}
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
                      )}
                    </>
                  }
                  device={
                    environments.find((env) => env.environmentId === chat.environmentId)?.label ??
                    "Offline device"
                  }
                >
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
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={
                            scope
                              ? `${layout.kept.includes(key) ? "Close reference" : "Hide"} ${chat.title}`
                              : `Remove ${chat.title} from board`
                          }
                          disabled={disabled}
                          onClick={() => {
                            setExpanded(null);
                            setLayout({
                              ...layout,
                              hidden:
                                scope && layout.kept.includes(key)
                                  ? layout.hidden.filter((item) => item !== key)
                                  : [...layout.hidden, key],
                              ...(scope
                                ? { kept: layout.kept.filter((item) => item !== key) }
                                : {}),
                            });
                            if (scope && focus === key)
                              void navigate({ ...spaceColumnsNavigation(scope), replace: true });
                          }}
                        />
                      }
                    >
                      <XIcon />
                    </TooltipTrigger>
                    <TooltipPopup>
                      {scope
                        ? layout.kept.includes(key)
                          ? "Close this reference. Its status stays unchanged."
                          : "Hide from this view. Restore it from Hidden."
                        : "Remove from this board. The chat stays saved."}
                    </TooltipPopup>
                  </Tooltip>
                </Column>
              );
            })}
            {!selectedKeys.size && (
              <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
                {scope
                  ? "No active chats here. Start a new chat, restore a hidden chat, or open a settled reference."
                  : "Add existing chats from any profile, space, or device. Enable Include settled chats to bring back a reference conversation."}
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function moveColumn(order: readonly string[], from: string, to: string) {
  const source = order.indexOf(from);
  const target = order.indexOf(to);
  return source < 0 || target < 0 || source === target
    ? order
    : arrayMove([...order], source, target);
}

export function columnStatus(
  chat: Pick<
    ColumnChat,
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "hasActionableProposedPlan"
    | "session"
    | "archivedAt"
    | "settledOverride"
    | "latestTurn"
  >,
  reviewedAt?: string,
) {
  if (chat.hasPendingApprovals || chat.hasPendingUserInput || chat.hasActionableProposedPlan)
    return "Needs input";
  if (chat.session?.status === "running") return "Running";
  if (chat.archivedAt) return "Archived";
  if (chat.settledOverride === "settled") return "Settled";
  if (chat.latestTurn?.state === "completed" && chat.latestTurn.completedAt) {
    return reviewedAt === chat.latestTurn.completedAt ? "Reviewed" : "Ready to review";
  }
  return "Idle";
}

function Column({
  chat,
  active,
  expanded,
  hidden,
  onFocus,
  onUse,
  device,
  connected,
  children,
  width,
  onResize,
  resizeDisabled,
  context,
  columnActions,
  onMove,
}: {
  width: number;
  onMove: (delta: number) => void;
  resizeDisabled: boolean;
  onResize: (width: number) => Promise<boolean>;
  context: {
    profile: string;
    space: string;
    folder: string | undefined;
    path: string | undefined;
    device: string;
  };
  chat: ColumnChat;
  active: boolean;
  expanded: boolean;
  hidden: boolean;
  onFocus: () => void;
  onUse: () => void;
  device: string;
  connected: boolean;
  children: React.ReactNode;
  columnActions: React.ReactNode;
}) {
  const reviewedAt = useWorkflowState((state) => state.reviewed[keyOf(chat)]);
  const statusLabel = columnStatus(chat, reviewedAt);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const titleCommitted = useRef(false);
  const commitTitle = (value: string) => {
    if (titleCommitted.current) return;
    titleCommitted.current = true;
    const resolution = resolveRenameCommit({ title: value, originalTitle: chat.title });
    setEditingTitle(null);
    if (resolution.action === "reject-empty") {
      toastManager.add({ type: "warning", title: "Chat title cannot be empty" });
      return;
    }
    if (resolution.action === "noop") return;
    void updateMetadata({
      environmentId: chat.environmentId,
      input: { threadId: chat.id, title: resolution.title },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not rename chat",
          description: String(squashAtomCommandFailure(result)),
        });
      }
    });
  };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: keyOf(chat),
    disabled: resizeDisabled || expanded || hidden,
  });
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
      ref={(node) => {
        element.current = node;
        setNodeRef(node);
      }}
      aria-label={`Chat column: ${chat.title}`}
      onPointerDownCapture={() => {
        onFocus();
        onUse();
      }}
      onKeyDownCapture={onUse}
      onFocusCapture={onFocus}
      hidden={hidden}
      style={{
        width: expanded ? "100%" : width,
        transform: DndCSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
      className={`${hidden ? "hidden" : "flex"} relative min-h-0 shrink-0 snap-start flex-col overflow-hidden rounded-xl border ${active ? "border-primary/60 ring-1 ring-primary/20" : "border-border"}`}
    >
      <header className="flex flex-col gap-2.5 border-b border-border/60 bg-muted/15 px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          {!expanded && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      event.stopPropagation();
                      onMove(event.key === "ArrowLeft" ? -1 : 1);
                    }}
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Move column: ${chat.title}`}
                    disabled={resizeDisabled}
                    className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
                  />
                }
              >
                <GripVerticalIcon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>Drag to reorder, or use Left and Right arrow keys.</TooltipPopup>
            </Tooltip>
          )}
          {editingTitle !== null ? (
            <Input
              autoFocus
              aria-label="Chat title"
              defaultValue={editingTitle}
              className="h-7 min-w-0 flex-1 text-sm font-semibold"
              onFocus={(event) => event.currentTarget.select()}
              onBlur={(event) => commitTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle(event.currentTarget.value);
                }
                if (event.key === "Escape") {
                  titleCommitted.current = true;
                  setEditingTitle(null);
                }
              }}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => {
                      onFocus();
                      if (!chat.draftId) {
                        titleCommitted.current = false;
                        setEditingTitle(chat.title);
                      }
                    }}
                    aria-label={`Rename ${chat.title}`}
                    className="min-w-0 flex-1 truncate rounded px-1 -ml-1 text-left text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                {chat.title}
              </TooltipTrigger>
              <TooltipPopup>{chat.draftId ? chat.title : "Click to rename chat"}</TooltipPopup>
            </Tooltip>
          )}
          <div className="flex shrink-0 items-center gap-1">{children}</div>
        </div>
        <div
          className="flex min-h-7 max-w-2xl items-center justify-between gap-2"
          aria-label="Chat status and review"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusLabel === "Needs input" ? "border-warning/25 bg-warning/10 text-foreground" : statusLabel === "Running" || statusLabel === "Ready to review" ? "border-primary/20 bg-primary/8 text-foreground" : "border-border/70 bg-muted/50 text-muted-foreground"}`}
            >
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
              {statusLabel}
            </span>
            {!connected && <span className="text-[10px] text-muted-foreground">Offline</span>}
          </div>
          <DashboardReviewBar thread={chat} compact />
        </div>
        <div aria-label="Chat context" className="flex min-w-0 max-w-2xl flex-wrap gap-1.5">
          <ContextLabel
            icon={UserRoundIcon}
            caption="Profile"
            value={context.profile}
            tone="indigo"
          />
          <ContextLabel icon={LayersIcon} caption="Space" value={context.space} tone="violet" />
          <ContextLabel
            icon={FolderIcon}
            caption="Project"
            value={context.folder ?? "Unassigned"}
            tone="sky"
          />
          {chat.branch && (
            <ContextLabel
              icon={GitBranchIcon}
              caption="Branch"
              value={chat.branch}
              tone="emerald"
            />
          )}
          <ContextLabel icon={MonitorIcon} caption="Device" value={context.device} tone="amber" />
          {context.path && (
            <ContextLabel
              icon={TerminalSquareIcon}
              caption="Path"
              tone="neutral"
              value={shortPath(context.path)}
              tooltip={`${context.path} (click to copy)`}
              mono
              onClick={() => {
                const path = context.path!;
                void writeTextToClipboard(path).then(
                  () => toastManager.add({ type: "success", title: "Path copied" }),
                  () => toastManager.add({ type: "error", title: "Could not copy path" }),
                );
              }}
            />
          )}
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
      <ChatPaneContext value={{ active: active && !hidden, column: !expanded, columnActions }}>
        <div className="flex min-h-0 flex-1 flex-col">
          {!connected ? (
            <div className="p-3">
              <Menu>
                <MenuTrigger render={<Button size="xs" variant="outline" />}>
                  Actions <ChevronDownIcon />
                </MenuTrigger>
                <MenuPopup>{columnActions}</MenuPopup>
              </Menu>
              <p className="mt-3 text-sm text-muted-foreground">
                Reconnect {device} to load this conversation.
              </p>
            </div>
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

const CONTEXT_LABEL_TONES = {
  indigo: "border-indigo-500/20 bg-indigo-500/8 text-indigo-600 dark:text-indigo-300",
  violet: "border-violet-500/20 bg-violet-500/8 text-violet-600 dark:text-violet-300",
  sky: "border-sky-500/20 bg-sky-500/8 text-sky-600 dark:text-sky-300",
  emerald: "border-emerald-500/20 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/8 text-amber-600 dark:text-amber-300",
  neutral: "border-border/70 bg-muted/50 text-muted-foreground",
} as const;

/** Last two segments of a path, enough to tell worktrees apart without the full string. */
function shortPath(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 2 ? `.../${segments.slice(-2).join("/")}` : path;
}

/** Tinted label for one piece of chat context: icon, small caption, value. */
function ContextLabel(props: {
  icon: LucideIcon;
  caption: string;
  value: string;
  tone: keyof typeof CONTEXT_LABEL_TONES;
  tooltip?: string;
  mono?: boolean;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  const className = `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${CONTEXT_LABEL_TONES[props.tone]} ${props.onClick ? "cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          props.onClick ? (
            <button type="button" onClick={props.onClick} className={className} />
          ) : (
            <span className={className} />
          )
        }
      >
        <Icon aria-hidden className="size-3 shrink-0" />
        <span className="shrink-0 text-[9px] font-semibold tracking-wide uppercase opacity-75">
          {props.caption}
        </span>
        <span
          className={`min-w-0 truncate font-medium text-foreground ${props.mono ? "font-mono text-[10px]" : ""}`}
        >
          {props.value}
        </span>
      </TooltipTrigger>
      <TooltipPopup>{props.tooltip ?? `${props.caption}: ${props.value}`}</TooltipPopup>
    </Tooltip>
  );
}
