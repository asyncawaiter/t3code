import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import { getSpaceDragData } from "./sidebar/Spaces.logic";
import { verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import * as Arr from "effect/Array";
import {
  resolveSidebarDropTarget,
  sidebarListItemId,
  sidebarMarkerId,
  type SidebarListItem,
  type SidebarListMarker,
  type SidebarSection,
} from "./Sidebar.logic";

const stationary = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
const hidden = { ...stationary, scaleY: 0 };
type ThreadItem = Extract<SidebarListItem, { kind: "thread" }>;
type Layout = Parameters<SortingStrategy>[0];

/** A Space drop never falls through to a nearby pin, reorder, or settle target. */
export function withSidebarSpaceTargets(
  threadCollision: CollisionDetection,
  canAssign: (profileId: string) => boolean,
): CollisionDetection {
  return (args) => {
    const source = getSpaceDragData(args.active.data.current);
    const spaces = args.droppableContainers.filter((container) =>
      getSpaceDragData(container.data.current),
    );
    const hits = pointerWithin({ ...args, droppableContainers: spaces });
    const hit = hits[0];
    const target = getSpaceDragData(hit?.data?.droppableContainer.data.current);
    if (source) {
      if (!target || target.spaceId === null || target.profileId !== source.profileId) return [];
      return closestCenter({
        ...args,
        droppableContainers: spaces.filter((container) => {
          const data = getSpaceDragData(container.data.current);
          return data?.spaceId !== null && data?.profileId === source.profileId;
        }),
      });
    }
    if (target) return target.acceptsThreads && canAssign(target.profileId) ? hits : [];
    if (
      pointerWithin(args).some(
        (collision) =>
          collision.id === sidebarMarkerId("controls") ||
          collision.id === sidebarMarkerId("spaces"),
      )
    )
      return [];
    return threadCollision({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => !getSpaceDragData(container.data.current),
      ),
    });
  };
}

/** Reject the nearest unsupported target without selecting another section.
 * Recreate this detector when drop eligibility changes. */
export function createSidebarCollisionDetection(
  isValidTarget: (id: string) => boolean,
  options: {
    items?: readonly SidebarListItem[];
    activationY?: number | null;
  } = {},
): CollisionDetection {
  const validity = new Map<string, boolean>();
  const sections = new Map<string, SidebarSection | null>();
  let previousPointerY = options.activationY;
  let boundarySection: "pinned" | "active" | undefined;
  return (args) => {
    let collisions = closestCenter(args);
    const pointer = args.pointerCoordinates;
    const items = options.items;
    const source = items?.find((item) => item.kind === "thread" && item.key === args.active.id);
    const nearestItem = items?.find((item) => sidebarListItemId(item) === collisions[0]?.id);
    if (
      items &&
      source?.kind === "thread" &&
      nearestItem &&
      (nearestItem.kind === "device" ||
        (nearestItem.kind === "thread" && nearestItem.section === "active")) &&
      !resolveSidebarDropTarget(items, source.key, sidebarListItemId(nearestItem))
    ) {
      return collisions.filter((collision) => collision.id === args.active.id);
    }
    const boundary = args.droppableContainers
      .find((container) => container.id === sidebarMarkerId("pinned-divider"))
      ?.node.current?.querySelector(".sidebar-drag-boundary-label")
      ?.getBoundingClientRect();
    if (items && boundary && source?.kind === "thread" && pointer) {
      boundarySection ??= source.section === "pinned" ? "pinned" : "active";
      // Use the visible divider row, including its sortable translation.
      // Only pointer movement can change sections: opening the destination
      // moves this row, but must not toggle a stationary gesture back.
      const previousY = previousPointerY ?? pointer.y;
      previousPointerY = pointer.y;
      if (pointer.x >= boundary.left && pointer.x <= boundary.right) {
        if (pointer.y < previousY && pointer.y <= boundary.bottom) boundarySection = "pinned";
        else if (pointer.y > previousY && pointer.y >= boundary.top) boundarySection = "active";
        const nextHeader =
          args.droppableContainers.find(
            (container) => container.id === sidebarMarkerId("snoozed-header"),
          ) ??
          args.droppableContainers.find(
            (container) => container.id === sidebarMarkerId("settled-header"),
          );
        const activeBottom = nextHeader?.node.current?.getBoundingClientRect().top;
        if (boundarySection === "pinned" || (activeBottom != null && pointer.y < activeBottom)) {
          const target = collisions.find((collision) => {
            const id = String(collision.id);
            if (!sections.has(id)) {
              sections.set(
                id,
                resolveSidebarDropTarget(items, String(args.active.id), id)?.section ?? null,
              );
            }
            return sections.get(id) === boundarySection;
          });
          if (target)
            collisions = [target, ...collisions.filter((collision) => collision !== target)];
        }
      }
    }
    const nearest = collisions[0];
    if (!nearest || nearest.id === args.active.id) {
      return collisions;
    }
    const id = String(nearest.id);
    const valid = validity.get(id) ?? isValidTarget(id);
    validity.set(id, valid);
    return valid ? collisions : collisions.filter((collision) => collision.id === args.active.id);
  };
}

/** Preview the committed section layout without moving or mounting DOM nodes.
 * A zero scaleY marks rows/markers to hide while retaining their measured nodes. */
export function createSidebarSortingStrategy(input: {
  items: readonly SidebarListItem[];
  deviceOrder?: readonly string[];
  settledOrder: readonly string[];
  settledExpanded: boolean;
  settledVisibleCount?: number;
  routeThreadKey?: string | null;
  snoozedThreadCount?: number;
  cardHeight?: number;
  slimHeight?: number;
  /** Space each pinned boundary opens for its label while dragging. The
   * markers stay zero height at rest, so nothing is reserved until pickup. */
  boundaryLabelHeight?: number;
}): SortingStrategy {
  const { items } = input;
  const indices = new Map(items.map((item, index) => [sidebarListItemId(item), index]));
  const controlsIndex = items.findIndex(
    (item) => item.kind === "marker" && item.marker === "controls",
  );
  const spacePins = new Set(
    controlsIndex < 0
      ? []
      : items
          .slice(controlsIndex + 1)
          .flatMap((item) =>
            item.kind === "thread" && item.section === "pinned" ? [item.key] : [],
          ),
  );
  let previous: Pick<Layout, "rects" | "activeIndex" | "overIndex"> | undefined;
  let transforms: ReturnType<SortingStrategy>[] | null = [];

  function project({ rects, activeIndex, overIndex }: Layout) {
    const active = items[activeIndex];
    const over = items[overIndex] ?? active;
    if (active?.kind !== "thread" || !over || !rects[0]) return [];
    const target = resolveSidebarDropTarget(items, active.key, sidebarListItemId(over));
    if (!target) return [];
    const groups: Record<SidebarSection, ThreadItem[]> = {
      pinned: [],
      active: [],
      snoozed: [],
      settled: [],
    };
    let cardHeight = input.cardHeight;
    let slimHeight = input.slimHeight;
    let headerScale: number | undefined;
    for (const [index, item] of items.entries()) {
      if (item.kind !== "thread") {
        if (
          item.kind === "marker" &&
          (item.marker === "settled-header" || item.marker === "snoozed-header")
        ) {
          const height = rects[index]?.height;
          if (height) headerScale ??= height / 32;
        }
        continue;
      }
      if (item.section === "pinned" || item.section === "active")
        cardHeight ??= rects[index]?.height;
      else slimHeight ??= rects[index]?.height;
      if (item.key !== active.key) groups[item.section].push(item);
    }
    // Cards are 4.5rem + 2px border + 0.25rem padding; slim rows/placeholders are h-9.
    const scale =
      slimHeight !== undefined ? slimHeight / 36 : (headerScale ?? (cardHeight ?? 78) / 78);
    cardHeight ??= 78 * scale;
    slimHeight ??= 36 * scale;
    const labelHeight = (input.boundaryLabelHeight ?? 0) * scale;
    const group = groups[target.section];
    const order =
      target.section === "pinned"
        ? target.pinnedOrder
        : target.section === "settled"
          ? input.settledOrder
          : target.activeOrder;
    const ranks = new Map(order.map((key, index) => [key, index]));
    const rank = ranks.get(active.key) ?? Number.POSITIVE_INFINITY;
    const index = group.findIndex(
      (item) => (ranks.get(item.key) ?? Number.POSITIVE_INFINITY) > rank,
    );
    group.splice(index < 0 ? group.length : index, 0, { ...active, section: target.section });
    const settledOrder = (
      input.settledOrder.length > 0 ? input.settledOrder : groups.settled.map((item) => item.key)
    ).filter((key) => key !== active.key || target.section === "settled");
    const visible = input.settledExpanded
      ? settledOrder.slice(0, input.settledVisibleCount ?? settledOrder.length)
      : [];
    const routeKey = input.routeThreadKey;
    if (routeKey && settledOrder.includes(routeKey) && !visible.includes(routeKey)) {
      visible.push(routeKey);
    }
    groups.settled = visible.map((key) => ({ kind: "thread", key, section: "settled" }));
    const projected: SidebarListItem[] = [];
    const marker = (name: SidebarListMarker) => projected.push({ kind: "marker", marker: name });
    const section = (name: "active" | "settled") => {
      if (groups[name].length > 0) projected.push(...groups[name]);
      else marker(`${name}-placeholder`);
    };
    if (items.some((item) => item.kind === "marker" && item.marker === "spaces")) marker("spaces");
    marker("pinned-header");
    projected.push(...groups.pinned.filter((item) => !spacePins.has(item.key)));
    if (controlsIndex >= 0) marker("controls");
    projected.push(...groups.pinned.filter((item) => spacePins.has(item.key)));
    marker("pinned-divider");
    if (groups.active.some((item) => item.environmentId !== undefined)) {
      const activeGroups = Arr.groupBy(groups.active, (item) => item.environmentId ?? "");
      const order = [
        ...new Set([
          ...(input.deviceOrder ?? []),
          ...items.flatMap((item) => (item.kind === "device" ? [item.environmentId] : [])),
          ...Object.keys(activeGroups),
        ]),
      ];
      for (const environmentId of order) {
        const rows = activeGroups[environmentId];
        if (!rows) continue;
        projected.push({ kind: "device", environmentId });
        projected.push(...rows);
      }
      if (groups.active.length === 0) marker("active-placeholder");
    } else section("active");
    if (
      groups.snoozed.length > 0 ||
      ((active.section !== "snoozed" || (input.snoozedThreadCount ?? 0) > 1) &&
        items.some((item) => item.kind === "marker" && item.marker === "snoozed-header"))
    ) {
      marker("snoozed-header");
      projected.push(...groups.snoozed);
    }
    marker("settled-header");
    section("settled");
    const result = items.map(() => hidden);
    let top = rects[0].top;
    for (const item of projected) {
      const index = indices.get(sidebarListItemId(item));
      const rect = index === undefined ? undefined : rects[index];
      if (index !== undefined && rect) result[index] = { ...stationary, y: top - rect.top };
      const fallback =
        item.kind === "device"
          ? 28 * scale
          : item.kind === "thread" && (item.section === "pinned" || item.section === "active")
            ? cardHeight
            : slimHeight;
      const moved = item.kind === "thread" && item.key === active.key;
      const height =
        item.kind === "marker" &&
        (item.marker === "pinned-header" || item.marker === "pinned-divider")
          ? Math.max(labelHeight, rect?.height ?? 0)
          : item.kind === "marker" && item.marker.endsWith("placeholder")
            ? slimHeight
            : moved
              ? fallback
              : (rect?.height ?? fallback);
      top += height + 1;
    }
    result[activeIndex] = stationary;
    return result;
  }

  return (args) => {
    if (
      previous?.rects !== args.rects ||
      previous.activeIndex !== args.activeIndex ||
      previous.overIndex !== args.overIndex
    ) {
      previous = args;
      transforms = project(args);
    }
    return transforms === null
      ? verticalListSortingStrategy(args)
      : (transforms[args.index] ?? stationary);
  };
}
