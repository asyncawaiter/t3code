import { SearchIcon } from "lucide-react";

import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DEFAULT_SKILL_FILTERS,
  filterSkillGroups,
  sourceCounts,
  type SkillFilters,
  type SkillGroup,
  type SkillSourceFilter,
  type SkillTarget,
} from "./skillsModel";

const SOURCE_CHIPS: Array<{ value: SkillSourceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "personal", label: "Personal" },
  { value: "builtin", label: "Built-in" },
  { value: "project", label: "Project" },
];

function coverageBadgeVariant(group: SkillGroup): "outline" | "warning" | "error" {
  if (group.status === "gaps") return "error";
  if (group.status === "drift") return "warning";
  return "outline";
}

export function SkillsList({
  groups,
  targets,
  filters,
  onFiltersChange,
  selectedName,
  onSelect,
}: {
  groups: readonly SkillGroup[];
  targets: readonly SkillTarget[];
  filters: SkillFilters;
  onFiltersChange: (filters: SkillFilters) => void;
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  const counts = sourceCounts(groups);
  const filtered = filterSkillGroups(groups, filters);
  const devices = [
    ...new Map(targets.map((target) => [target.environmentId, target.envLabel])).entries(),
  ];
  const providers = [
    ...new Map(targets.map((target) => [target.instanceId, target.providerLabel])).entries(),
  ];

  return (
    <div className="flex h-full min-w-0 flex-col border-r border-sidebar-border">
      <div className="flex flex-col gap-2 border-b border-sidebar-border p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7"
            placeholder="Search skills"
            value={filters.search}
            onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            aria-label="Search skills"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SOURCE_CHIPS.map((chip) => (
            <Button
              key={chip.value}
              size="xs"
              variant={filters.source === chip.value ? "secondary" : "ghost"}
              onClick={() => onFiltersChange({ ...filters, source: chip.value })}
            >
              {chip.label}
              <span className="text-muted-foreground">{counts[chip.value]}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            aria-label="Filter by device"
            value={filters.environmentId ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, environmentId: event.target.value || null })
            }
          >
            <option value="">All devices</option>
            {devices.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            aria-label="Filter by provider"
            value={filters.instanceId ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, instanceId: event.target.value || null })
            }
          >
            <option value="">All providers</option>
            {providers.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            aria-label="Filter by status"
            value={filters.status}
            onChange={(event) =>
              onFiltersChange({ ...filters, status: event.target.value as SkillFilters["status"] })
            }
          >
            <option value="all">Any status</option>
            <option value="gaps">Has gaps</option>
            <option value="drift">Drifted</option>
            <option value="in-sync">In sync</option>
          </select>
          <Button size="xs" variant="ghost" onClick={() => onFiltersChange(DEFAULT_SKILL_FILTERS)}>
            Clear
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No skills match.</p>
        ) : (
          filtered.map((group) => (
            <button
              key={group.name}
              type="button"
              onClick={() => onSelect(group.name)}
              aria-current={selectedName === group.name ? "true" : undefined}
              className={`flex w-full flex-col gap-1 border-b border-sidebar-border/60 p-3 text-left hover:bg-accent/50 ${
                selectedName === group.name ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{group.name}</span>
                <Badge variant={coverageBadgeVariant(group)} size="sm">
                  {group.coverage.installed}/{group.coverage.expected}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" size="sm">
                  {group.source}
                </Badge>
              </div>
              {group.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{group.description}</p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
