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
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle, PopoverClose } from "../ui/popover";
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

const ChatView = lazy(() => import("../ChatView"));
const Layout = Schema.Struct({
  order: Schema.Array(Schema.String),
  hidden: Schema.Array(Schema.String),
  kept: Schema.Array(Schema.String),
});
const EMPTY_LAYOUT = { order: [], kept: [], hidden: [] };
export const columnWidth = (width: number) =>
  Math.max(340, Math.min(1000, Number.isFinite(width) ? width : 420));
const Widths = Schema.Record(Schema.String, Schema.Finite);
const Added = Schema.Array(Schema.String);
const NO_ADDED: string[] = [];
const EMPTY_WIDTHS: Record<string, number> = {};
const keyOf = (chat: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  `${chat.environmentId}:${chat.id}`;

export function boardChats<T extends Pick<EnvironmentThreadShell, "environmentId" | "id">>(
  defaults: readonly T[],
  available: readonly T[],
  added: readonly string[],
) {
  const chosen = new Set(added);
  return [
    ...new Map(
      [...defaults, ...available.filter((chat) => chosen.has(keyOf(chat)))].map((chat) => [
        keyOf(chat),
        chat,
      ]),
    ).values(),
  ];
}

export function columnOrder<
  T extends Pick<
    EnvironmentThreadShell,
    "environmentId" | "id" | "archivedAt" | "settledOverride" | "createdAt"
  >,
>(chats: readonly T[], layout: typeof Layout.Type) {
  const eligible = chats.filter(
    (chat) =>
      !chat.archivedAt &&
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

export default function ChatColumns({
  chats,
  scope,
  focus,
  allChats = chats,
  navigation,
}: {
  chats: readonly EnvironmentThreadShell[];
  allChats?: readonly EnvironmentThreadShell[];
  scope: string;
  navigation?: React.ReactNode;
  focus?: string | undefined;
}) {
  const [layout, setLayout] = useLocalStorage(`t3.chat-columns.${scope}`, EMPTY_LAYOUT, Layout);
  const [added, setAdded] = useLocalStorage(`t3.chat-columns.added.${scope}`, NO_ADDED, Added);
  const [widths, setWidths] = useLocalStorage(
    `t3.chat-columns.widths.${scope}`,
    EMPTY_WIDTHS,
    Widths,
  );
  const candidates = useMemo(() => boardChats(chats, allChats, added), [chats, allChats, added]);
  const columns = useMemo(() => columnOrder(candidates, layout), [candidates, layout]);
  const [search, setSearch] = useState("");
  const [includeSettled, setIncludeSettled] = useState(false);
  const projects = useProjects();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const placements = useMemo(() => indexProfileSpaces(profiles), [profiles]);
  const detailsFor = (chat: EnvironmentThreadShell) => {
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
      profile: owner?.name ?? "Unassigned",
      space: placement?.space.name ?? "Unsorted",
      folder: folder?.title,
      path: folder?.workspaceRoot,
      device:
        environments.find((env) => env.environmentId === chat.environmentId)?.label ??
        "Offline device",
    };
  };
  const contextFor = (chat: EnvironmentThreadShell) => {
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
  useEffect(() => {
    const added = candidates
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(keyOf)
      .filter((key) => !layout.order.includes(key));
    if (added.length)
      setLayout((current) => ({ ...current, order: [...new Set([...current.order, ...added])] }));
  }, [candidates, layout.order, setLayout]);
  const [focused, setFocused] = useState<string | null>(focus ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = columns.some((chat) => keyOf(chat) === focused)
    ? focused
    : columns[0]
      ? keyOf(columns[0])
      : null;
  const rail = useRef<HTMLDivElement>(null);
  const { environments } = useEnvironments();
  const [savedScroll, setSavedScroll] = useLocalStorage(
    `t3.chat-columns.scroll.${scope}`,
    0,
    Schema.Finite,
  );
  const scroll = useRef(savedScroll);
  useLayoutEffect(() => {
    if (rail.current) rail.current.scrollLeft = expanded ? 0 : scroll.current;
  }, [expanded]);
  const appliedFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focus || appliedFocus.current === focus) return;
    const chat = candidates.find((chat) => keyOf(chat) === focus);
    if (
      chat &&
      (layout.hidden.includes(focus) ||
        (chat.settledOverride === "settled" && !layout.kept.includes(focus)))
    ) {
      setLayout((current) => ({
        ...current,
        hidden: current.hidden.filter((key) => key !== focus),
        kept: [...new Set([...current.kept, focus])],
      }));
    }
  }, [focus, candidates, layout, setLayout]);
  useLayoutEffect(() => {
    if (focus && focus !== appliedFocus.current && columns.length && rail.current) {
      const node = rail.current.querySelector(`[data-column-key="${CSS.escape(focus)}"]`);
      if (node instanceof HTMLElement) {
        rail.current.scrollLeft = node.offsetLeft - rail.current.offsetLeft;
        appliedFocus.current = focus;
        setFocused(focus);
      } else if (layout.hidden.includes(focus)) {
        setLayout((current) => ({
          ...current,
          hidden: current.hidden.filter((key) => key !== focus),
        }));
      }
    }
  }, [focus, columns, layout.hidden, setLayout]);
  useEffect(() => () => setSavedScroll(scroll.current), [setSavedScroll]);
  function reorder(key: string, delta: number) {
    const order = columns.map(keyOf),
      index = order.indexOf(key),
      target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setLayout({ ...layout, order });
  }
  const selectedKeys = new Set(columns.map(keyOf));
  const choices = allChats
    .filter(
      (chat) =>
        !chat.archivedAt &&
        (includeSettled || chat.settledOverride !== "settled" || selectedKeys.has(keyOf(chat))),
    )
    .map((chat) => ({ chat, detail: detailsFor(chat) }))
    .filter(({ chat, detail }) =>
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
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/25 p-1.5 text-xs text-muted-foreground">
        {navigation && <div className="min-w-0 flex-1 overflow-hidden">{navigation}</div>}
        <span className="flex shrink-0 items-center gap-1.5 border-l border-border/70 px-2">
          <Columns3Icon aria-hidden className="size-3.5" />
          {added.some(
            (key) =>
              columns.some((chat) => keyOf(chat) === key) &&
              !chats.some((chat) => keyOf(chat) === key),
          )
            ? "Custom board"
            : "Space board"}{" "}
          <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
            {columns.length}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button size="xs" variant="outline" />}>
              <Columns3Icon className="size-3.5" />
              Choose chats
            </PopoverTrigger>
            <PopoverPopup
              align="end"
              className="w-[min(26rem,calc(100vw-2rem))]"
              viewportClassName="p-0 not-data-transitioning:overflow-hidden"
            >
              <div className="flex max-h-[min(32rem,var(--available-height))] flex-col">
                <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <PopoverTitle className="text-sm font-semibold">Choose chats</PopoverTitle>
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
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={includeSettled} onCheckedChange={setIncludeSettled} />
                    Show settled chats
                  </label>
                </div>
                <div
                  className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5"
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
                          onCheckedChange={(checked) => {
                            if (checked) setAdded((current) => [...new Set([...current, key])]);
                            setLayout((current) => ({
                              ...current,
                              order: checked
                                ? [...new Set([...current.order, key])]
                                : current.order,
                              hidden: checked
                                ? current.hidden.filter((id) => id !== key)
                                : [...new Set([...current.hidden, key])],
                              kept:
                                checked && chat.settledOverride === "settled"
                                  ? [...new Set([...current.kept, key])]
                                  : current.kept,
                            }));
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
                  <Button size="xs" variant="ghost" onClick={() => setWidths({})}>
                    Reset column widths
                  </Button>
                  <PopoverClose render={<Button size="xs" variant="secondary" />}>
                    Done
                  </PopoverClose>
                </div>
              </div>
            </PopoverPopup>
          </Popover>
        </div>
      </div>
      <div
        ref={rail}
        onScroll={(event) => {
          if (!expanded) scroll.current = event.currentTarget.scrollLeft;
        }}
        className="flex min-h-0 flex-1 snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
      >
        {columns.map((chat) => {
          const key = keyOf(chat);
          return (
            <Column
              key={key}
              chat={chat}
              context={contextFor(chat)}
              width={columnWidth(widths[key] ?? 420)}
              onResize={(width) =>
                setWidths((current) => ({ ...current, [key]: columnWidth(width) }))
              }
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
                  <MenuItem disabled={columns[0] === chat} onClick={() => reorder(key, -1)}>
                    <ArrowLeftIcon />
                    Move left
                  </MenuItem>
                  <MenuItem disabled={columns.at(-1) === chat} onClick={() => reorder(key, 1)}>
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
                size="icon-xs"
                variant="ghost"
                aria-label={expanded === key ? "Return to columns" : `Expand ${chat.title}`}
                onClick={() => {
                  setFocused(key);
                  setExpanded(expanded === key ? null : key);
                }}
              >
                {expanded === key ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Hide ${chat.title} from columns`}
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
        {!columns.length && (
          <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
            No active chats here. Start a chat or use Choose chats to bring back a reference
            conversation.
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
  context,
}: {
  width: number;
  onResize: (width: number) => void;
  context: string;
  chat: EnvironmentThreadShell;
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
      {!expanded && (
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
              onResize(next);
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
                routeKind="server"
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
