import { useCallback, useMemo, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import * as Schema from "effect/Schema";
import { LayoutGridIcon, LibraryBigIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { useEnvironments } from "../../state/environments";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { SkillActionDialog, type SkillActionRequest } from "./SkillActionDialog";
import { SkillBackupsPanel } from "./SkillBackupsPanel";
import { SkillDetail } from "./SkillDetail";
import { SkillEnvironmentLoader, type SkillEnvironmentLiveState } from "./SkillEnvironmentLoader";
import { SkillsGapsView } from "./SkillsGapsView";
import { SkillsList } from "./SkillsList";
import { readCachedSkillInventory } from "./skillInventoryCache";
import {
  buildSkillGroups,
  buildSkillTargets,
  DEFAULT_SKILL_FILTERS,
  type SkillEnvironmentInput,
  type SkillFilters,
} from "./skillsModel";

export type SkillsPageView = "library" | "gaps";

const HiddenDriversSchema = Schema.mutable(Schema.Array(Schema.String));

const PROVIDER_NAMES: Record<string, string> = {
  claudeAgent: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};

export function SkillsPage({
  selectedSkill,
  view,
  onSelectSkill,
  onViewChange,
}: {
  selectedSkill: string | null;
  view: SkillsPageView;
  onSelectSkill: (name: string | null) => void;
  onViewChange: (view: SkillsPageView) => void;
}) {
  const { environments: presentations } = useEnvironments();
  const [live, setLive] = useState<Record<string, SkillEnvironmentLiveState>>({});
  const [filters, setFilters] = useState<SkillFilters>(DEFAULT_SKILL_FILTERS);
  const [dialogRequest, setDialogRequest] = useState<SkillActionRequest | null>(null);
  // Hidden rather than shown, so a newly added provider appears until the user opts out.
  const [hiddenDrivers, setHiddenDrivers] = useLocalStorage(
    "t3code:skills:hidden-drivers",
    [] as string[],
    HiddenDriversSchema,
  );

  const handleLiveUpdate = useCallback((state: SkillEnvironmentLiveState) => {
    setLive((prev) => ({ ...prev, [state.environmentId]: state }));
  }, []);

  const connectedIds = useMemo(
    () =>
      presentations
        .filter((env) => env.connection.phase === "connected")
        .map((env) => env.environmentId),
    [presentations],
  );

  const environments: SkillEnvironmentInput[] = useMemo(
    () =>
      presentations.map((env): SkillEnvironmentInput => {
        const online = env.connection.phase === "connected";
        const liveState = live[env.environmentId];
        if (online && liveState?.inventory) {
          return {
            environmentId: env.environmentId,
            label: env.label,
            online,
            inventory: liveState.inventory,
            stale: false,
          };
        }
        const cached = readCachedSkillInventory(env.environmentId);
        return {
          environmentId: env.environmentId,
          label: env.label,
          online,
          inventory: cached,
          stale: cached !== null,
        };
      }),
    [presentations, live],
  );

  const allDrivers = useMemo(
    () =>
      [
        ...new Set(
          environments.flatMap(
            (env) => env.inventory?.providers.map((provider) => provider.driver) ?? [],
          ),
        ),
      ].toSorted(),
    [environments],
  );
  const hiddenCount = allDrivers.filter((driver) => hiddenDrivers.includes(driver)).length;
  const visibleEnvironments = useMemo(
    () =>
      hiddenDrivers.length === 0
        ? environments
        : environments.map((env) =>
            env.inventory
              ? {
                  ...env,
                  inventory: {
                    ...env.inventory,
                    providers: env.inventory.providers.filter(
                      (provider) => !hiddenDrivers.includes(provider.driver),
                    ),
                  },
                }
              : env,
          ),
    [environments, hiddenDrivers],
  );
  const groups = useMemo(() => buildSkillGroups(visibleEnvironments), [visibleEnvironments]);
  const targets = useMemo(() => buildSkillTargets(visibleEnvironments), [visibleEnvironments]);
  const selected = selectedSkill
    ? (groups.find((group) => group.name === selectedSkill) ?? null)
    : null;

  const refreshAll = () => {
    for (const state of Object.values(live)) state.refresh();
  };
  const refreshEnvironment = (environmentId: EnvironmentId) => {
    live[environmentId]?.refresh();
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      {connectedIds.map((environmentId) => (
        <SkillEnvironmentLoader
          key={environmentId}
          environmentId={environmentId}
          onUpdate={handleLiveUpdate}
        />
      ))}
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Skills</h1>
          <ToggleGroup
            aria-label="Skills view"
            value={[view]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "library" || value === "gaps") onViewChange(value);
            }}
          >
            <Toggle value="library" aria-label="Library view" size="sm">
              <LibraryBigIcon className="size-3.5" />
              Library
            </Toggle>
            <Toggle value="gaps" aria-label="Gaps view" size="sm">
              <LayoutGridIcon className="size-3.5" />
              Gaps
            </Toggle>
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-1">
          <Menu>
            <MenuTrigger
              render={<Button size="xs" variant="ghost" aria-label="Choose providers" />}
            >
              <SlidersHorizontalIcon className="size-3.5" />
              Providers
              {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
            </MenuTrigger>
            <MenuPopup align="end">
              {allDrivers.map((driver) => (
                <MenuCheckboxItem
                  key={driver}
                  checked={!hiddenDrivers.includes(driver)}
                  onCheckedChange={(checked) =>
                    setHiddenDrivers((current) =>
                      checked
                        ? current.filter((hidden) => hidden !== driver)
                        : [...new Set([...current, driver])],
                    )
                  }
                >
                  {PROVIDER_NAMES[driver] ?? driver}
                </MenuCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Refresh skills"
            onClick={refreshAll}
          >
            <RefreshIcon refreshing={Object.values(live).some((state) => state.isPending)} />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {view === "library" ? (
          <>
            <div className="w-80 shrink-0">
              <SkillsList
                groups={groups}
                targets={targets}
                filters={filters}
                onFiltersChange={setFilters}
                selectedName={selected?.name ?? null}
                onSelect={onSelectSkill}
              />
            </div>
            <div className="min-w-0 flex-1">
              {selected ? (
                <SkillDetail
                  skill={selected}
                  targets={targets}
                  onRequestAction={setDialogRequest}
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  Choose a skill to see its coverage.
                </p>
              )}
            </div>
          </>
        ) : (
          <SkillsGapsView
            groups={groups}
            targets={targets}
            onSelectSkill={(name) => {
              onViewChange("library");
              onSelectSkill(name);
            }}
            onRequestAction={setDialogRequest}
          />
        )}
      </div>
      {environments
        .filter((env) => env.inventory && env.inventory.backups.length > 0)
        .map((env) => (
          <SkillBackupsPanel
            key={env.environmentId}
            environmentId={env.environmentId}
            backups={env.inventory!.backups}
            onRefreshEnvironment={refreshEnvironment}
          />
        ))}
      {environments.some((env) => env.stale) && (
        <p className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">
          Some devices are offline; showing their last known skills
          {(() => {
            const oldest = environments.find((env) => env.stale)?.inventory?.checkedAt;
            return oldest ? ` as of ${formatRelativeTimeLabel(oldest)}` : "";
          })()}
          .
        </p>
      )}
      <SkillActionDialog
        request={dialogRequest}
        onClose={() => setDialogRequest(null)}
        onRefreshEnvironment={refreshEnvironment}
      />
    </div>
  );
}
