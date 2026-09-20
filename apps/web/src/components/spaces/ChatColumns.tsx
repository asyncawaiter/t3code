import { useEffect, useMemo, useLayoutEffect, useRef, useState, lazy, Suspense } from "react";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  PinIcon,
  XIcon,
} from "lucide-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useEnvironments } from "../../state/environments";
import { Button } from "../ui/button";
import { ChatPaneContext } from "../chat/ChatPaneContext";
import { openWorkItem } from "../../workItems";

const ChatView = lazy(() => import("../ChatView"));
const Layout = Schema.Struct({
  order: Schema.Array(Schema.String),
  hidden: Schema.Array(Schema.String),
  kept: Schema.Array(Schema.String),
});
const EMPTY_LAYOUT = { order: [], kept: [], hidden: [] };
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
}: {
  chats: readonly EnvironmentThreadShell[];
  scope: string;
  focus?: string | undefined;
}) {
  const [layout, setLayout] = useLocalStorage(`t3.chat-columns.${scope}`, EMPTY_LAYOUT, Layout);
  const columns = useMemo(() => columnOrder(chats, layout), [chats, layout]);
  useEffect(() => {
    const added = chats
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(keyOf)
      .filter((key) => !layout.order.includes(key));
    if (added.length)
      setLayout((current) => ({ ...current, order: [...new Set([...current.order, ...added])] }));
  }, [chats, layout.order, setLayout]);
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{columns.length} chats · Scroll sideways to move between columns</span>
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-border px-2 py-1 text-foreground">
            Choose chats
          </summary>
          <div className="absolute right-0 z-40 mt-1 max-h-72 w-72 space-y-2 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg">
            {chats
              .filter((chat) => !chat.archivedAt)
              .map((chat) => {
                const key = keyOf(chat),
                  visible = columns.some((col) => keyOf(col) === key);
                return (
                  <label key={key} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          hidden: e.target.checked
                            ? layout.hidden.filter((id) => id !== key)
                            : [...layout.hidden, key],
                          kept:
                            e.target.checked && chat.settledOverride === "settled"
                              ? [...new Set([...layout.kept, key])]
                              : layout.kept,
                        })
                      }
                    />
                    <span>
                      {chat.title}
                      {chat.settledOverride === "settled" ? " · Settled" : ""}
                    </span>
                  </label>
                );
              })}
          </div>
        </details>
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
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Move ${chat.title} left`}
                disabled={columns[0] === chat}
                onClick={() => reorder(key, -1)}
              >
                <ArrowLeftIcon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Move ${chat.title} right`}
                disabled={columns.at(-1) === chat}
                onClick={() => reorder(key, 1)}
              >
                <ArrowRightIcon />
              </Button>
              <Button
                size="icon-xs"
                variant={layout.kept.includes(key) ? "secondary" : "ghost"}
                aria-label={`Keep ${chat.title} visible when settled`}
                aria-pressed={layout.kept.includes(key)}
                onClick={() =>
                  setLayout({
                    ...layout,
                    kept: layout.kept.includes(key)
                      ? layout.kept.filter((id) => id !== key)
                      : [...layout.kept, key],
                  })
                }
              >
                <PinIcon />
              </Button>
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
}: {
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
      className={`${hidden ? "hidden" : "flex"} min-h-0 shrink-0 snap-start flex-col overflow-hidden rounded-xl border ${active ? "border-primary/60 ring-1 ring-primary/20" : "border-border"} ${expanded ? "w-full" : "w-[min(100%,420px)] min-[1700px]:w-[calc((100%_-_1.5rem)/3)]"}`}
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
              : chat.session?.status === "running"
                ? "Running"
                : chat.settledOverride === "settled"
                  ? "Settled"
                  : "Idle"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {device}
          </span>
          {!expanded && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                openWorkItem({
                  environmentId: chat.environmentId,
                  projectId: chat.projectId,
                  source: { environmentId: chat.environmentId, threadId: chat.id },
                })
              }
            >
              + Task
            </Button>
          )}
          {children}
        </div>
      </header>
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
