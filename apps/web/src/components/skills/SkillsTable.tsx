import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { ChevronDownIcon, CopyPlusIcon, SearchIcon, XIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Skeleton } from "../ui/skeleton";
import { Toggle as ToggleGroupItem, ToggleGroup } from "../ui/toggle-group";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { SkillActionRequest } from "./SkillActionDialog";
import {
  filterSkillGroups,
  sourceCounts,
  type SkillFilters,
  type SkillGroup,
  type SkillSourceFilter,
  type SkillTarget,
} from "./skillsModel";
import {
  AvailabilityMark,
  CELL_LABEL,
  copyRequest,
  copyRequestItem,
  ProviderMark,
  SOURCE_LABEL,
  targetsByDevice,
} from "./skillsUi";

const SOURCE_FILTERS: ReadonlyArray<{ value: SkillSourceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "personal", label: "Personal" },
  { value: "builtin", label: "Built-in" },
  { value: "project", label: "Project" },
];

/**
 * The skills home: every skill as a row, every device and provider as a column. Selection,
 * focus and filters live in the page so they survive a trip into a skill and back.
 */
export function SkillsTable({
  groups,
  targets,
  loading,
  filters,
  onFiltersChange,
  selected,
  onSelectedChange,
  focusedName,
  onFocusedNameChange,
  onOpen,
  onRequestAction,
}: {
  groups: readonly SkillGroup[];
  targets: readonly SkillTarget[];
  loading: boolean;
  filters: SkillFilters;
  onFiltersChange: (filters: SkillFilters) => void;
  selected: ReadonlySet<string>;
  onSelectedChange: (selected: Set<string>) => void;
  focusedName: string | null;
  onFocusedNameChange: (name: string | null) => void;
  onOpen: (name: string) => void;
  onRequestAction: (request: SkillActionRequest) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => filterSkillGroups(groups, filters), [groups, filters]);
  const counts = useMemo(() => sourceCounts(groups), [groups]);
  const differingCount = useMemo(() => groups.filter((group) => group.differs).length, [groups]);
  const devices = useMemo(() => targetsByDevice(targets), [targets]);
  const orderedTargets = devices.flatMap((device) => device.targets);
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `2.75rem minmax(18rem, 1fr) repeat(${orderedTargets.length}, 4.5rem) 7.5rem`,
  };
  const focusedIndex = rows.findIndex((row) => row.name === focusedName);

  useEffect(() => {
    if (focusedIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-row-index="${focusedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleSelected = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectedChange(next);
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, button, [role=checkbox]")) return;
    const move = (delta: number) => {
      event.preventDefault();
      const index = Math.min(rows.length - 1, Math.max(0, focusedIndex + delta));
      onFocusedNameChange(rows[index]?.name ?? null);
    };
    if (event.key === "ArrowDown" || event.key === "j") move(1);
    else if (event.key === "ArrowUp" || event.key === "k") move(-1);
    else if (event.key === "Enter" && focusedName) onOpen(focusedName);
    else if ((event.key === " " || event.key === "x") && focusedName) {
      event.preventDefault();
      toggleSelected(focusedName);
    } else if (event.key === "Escape" && selected.size > 0) onSelectedChange(new Set());
  };

  const selectedGroups = rows.filter((row) => selected.has(row.name));
  const copySelectionTo = (target: SkillTarget) => {
    const items = selectedGroups.flatMap((group) => {
      const item = copyRequestItem(group, group.cells.get(target.key), target);
      return item ? [item] : [];
    });
    const request = copyRequest(`Copy ${items.length} skills to ${target.envLabel}`, items);
    if (request) onRequestAction(request);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <div className="relative w-80 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search skills"
            placeholder="Search skills"
            value={filters.search}
            onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onFocusedNameChange(rows[0]?.name ?? null);
                listRef.current?.focus();
              }
            }}
            className="pr-8 pl-8 text-[15px]"
          />
          {!filters.search && (
            <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
          )}
        </div>
        <ToggleGroup
          aria-label="Skill source"
          value={[filters.source]}
          onValueChange={(next) => {
            const value = next[0] as SkillSourceFilter | undefined;
            if (value) onFiltersChange({ ...filters, source: value });
          }}
        >
          {SOURCE_FILTERS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="h-7 px-3 text-[13px]"
            >
              {option.label}
              <span className="ml-1.5 text-muted-foreground tabular-nums">
                {counts[option.value]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {differingCount > 0 && (
          <Toggle
            size="xs"
            variant="outline"
            pressed={filters.differsOnly}
            onPressedChange={(pressed) => onFiltersChange({ ...filters, differsOnly: pressed })}
            className="gap-1.5 px-2.5 text-[13px]"
          >
            <AvailabilityMark status="drift" className="size-3.5" />
            Differs
            <span className="text-muted-foreground tabular-nums">{differingCount}</span>
          </Toggle>
        )}
        <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
          {rows.length === groups.length
            ? `${groups.length} skills`
            : `${rows.length} of ${groups.length} skills`}
        </span>
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        role="grid"
        aria-label="Skills"
        aria-rowcount={rows.length}
        onKeyDown={onListKeyDown}
        className="surface-raised relative mx-6 mb-6 min-h-0 flex-1 overflow-auto rounded-xl outline-none"
      >
        <div className="min-w-max px-3 pb-24">
          <div
            role="row"
            style={gridStyle}
            className="surface-lid sticky top-0 z-10 -mx-3 grid items-end px-6 pt-1"
          >
            <span />
            <span className="pb-2 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Skill
            </span>
            {devices.map((device) => (
              <div
                key={device.environmentId}
                style={{ gridColumn: `span ${device.targets.length}` }}
                className="flex flex-col items-stretch"
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="mx-1 truncate border-b border-border/70 pb-1 text-center text-[13px] font-medium" />
                    }
                  >
                    {device.label}
                    {!device.online && (
                      <span className="ml-1 font-normal text-muted-foreground">offline</span>
                    )}
                  </TooltipTrigger>
                  <TooltipPopup>
                    {device.online
                      ? device.label
                      : `${device.label} is offline. Showing its last known skills.`}
                  </TooltipPopup>
                </Tooltip>
                <div className="flex">
                  {device.targets.map((target) => (
                    <span
                      key={target.key}
                      className="flex w-18 flex-col items-center gap-0.5 py-1.5 text-xs text-muted-foreground"
                    >
                      <ProviderMark target={target} />
                      <span className="max-w-full truncate">{target.providerLabel}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <span className="pb-2 text-right text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Updated
            </span>
          </div>

          {loading &&
            rows.length === 0 &&
            Array.from({ length: 8 }, (_, index) => (
              <div key={index} style={gridStyle} className="grid items-center border-b px-3 py-3.5">
                <span />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-80" />
                </div>
              </div>
            ))}

          {!loading && rows.length === 0 && (
            <div className="px-3 py-16 text-center">
              <p className="text-[15px] font-medium">No skills match</p>
              <p className="mt-1 text-[15px] text-muted-foreground">
                Try a different search or source.
              </p>
            </div>
          )}

          {rows.map((group, index) => {
            const isSelected = selected.has(group.name);
            const isFocused = index === focusedIndex;
            return (
              <div
                key={group.name}
                role="row"
                data-row-index={index}
                aria-selected={isSelected}
                style={gridStyle}
                onClick={() => onOpen(group.name)}
                className={cn(
                  "group/row grid cursor-pointer items-center rounded-lg px-3 py-3.5",
                  isFocused ? "bg-accent/55" : "hover:bg-accent/40",
                  isSelected && "bg-primary/6",
                )}
              >
                <span onClick={(event) => event.stopPropagation()} className="flex items-center">
                  <Checkbox
                    aria-label={`Select ${group.name}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(group.name)}
                    className={cn(
                      !isSelected && selected.size === 0 && "opacity-0 group-hover/row:opacity-100",
                      isFocused && "opacity-100",
                    )}
                  />
                </span>
                <div className="min-w-0 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-foreground">
                      {group.name}
                    </span>
                    {group.source !== "personal" && (
                      <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground">
                        {SOURCE_LABEL[group.source]}
                      </Badge>
                    )}
                    {group.differs && (
                      <span className="shrink-0 text-[13px] text-warning-foreground">Differs</span>
                    )}
                  </div>
                  {group.description && (
                    <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                </div>
                {orderedTargets.map((target) => {
                  const cell = group.cells.get(target.key);
                  if (!cell) return <span key={target.key} />;
                  const addable = copyRequestItem(group, cell, target);
                  return (
                    <Tooltip key={target.key}>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`${target.envLabel} ${target.providerLabel}: ${CELL_LABEL[cell.status]}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (cell.status === "missing" && addable) {
                                const request = copyRequest(group.name, [addable]);
                                if (request) onRequestAction(request);
                              } else onOpen(group.name);
                            }}
                            className="group/cell mx-auto flex size-8 items-center justify-center rounded-md hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          />
                        }
                      >
                        <AvailabilityMark status={cell.status} dimmed={!target.online} />
                      </TooltipTrigger>
                      <TooltipPopup className="max-w-80">
                        <p className="font-medium">
                          {target.envLabel} · {target.providerLabel}
                        </p>
                        <p className="text-muted-foreground">{CELL_LABEL[cell.status]}</p>
                        {cell.install?.modifiedAt && (
                          <p className="text-muted-foreground">
                            Changed {formatRelativeTimeLabel(cell.install.modifiedAt)}
                          </p>
                        )}
                        {cell.install && (
                          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                            {cell.install.path}
                          </p>
                        )}
                        {cell.status === "missing" && addable && (
                          <p className="mt-1">Click to add it here</p>
                        )}
                      </TooltipPopup>
                    </Tooltip>
                  );
                })}
                <span className="text-right text-[13px] text-muted-foreground tabular-nums">
                  {group.updatedAt ? formatRelativeTimeLabel(group.updatedAt) : ""}
                </span>
              </div>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="pointer-events-none sticky bottom-5 flex justify-center">
            <div className="surface-raised-strong pointer-events-auto flex items-center gap-1 rounded-xl py-1.5 pr-1.5 pl-4">
              <span className="mr-2 text-[15px] tabular-nums">{selected.size} selected</span>
              <Menu>
                <MenuTrigger render={<Button size="sm" />}>
                  <CopyPlusIcon className="size-4" />
                  Copy to
                  <ChevronDownIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end" side="top" className="min-w-64">
                  {devices.map((device) => (
                    <MenuGroup key={device.environmentId}>
                      <MenuGroupLabel>{device.label}</MenuGroupLabel>
                      {device.targets.map((target) => {
                        const actionable = selectedGroups.filter((group) =>
                          copyRequestItem(group, group.cells.get(target.key), target),
                        ).length;
                        return (
                          <MenuItem
                            key={target.key}
                            disabled={actionable === 0}
                            onClick={() => copySelectionTo(target)}
                          >
                            <ProviderMark target={target} />
                            <span className="flex-1">{target.providerLabel}</span>
                            <span className="text-[13px] text-muted-foreground">
                              {!target.online
                                ? "Offline"
                                : actionable === 0
                                  ? "Already there"
                                  : `${actionable} to copy`}
                            </span>
                          </MenuItem>
                        );
                      })}
                    </MenuGroup>
                  ))}
                </MenuPopup>
              </Menu>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Clear selection"
                onClick={() => onSelectedChange(new Set())}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
