import { useCallback, useMemo, useState } from "react";
import * as Schema from "effect/Schema";
import type { EnvironmentId } from "@t3tools/contracts";
import { SlidersHorizontalIcon } from "lucide-react";

import { RefreshIcon } from "~/components/ui/refresh-icon";
import { Button } from "../ui/button";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { isElectron } from "../../env";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useEnvironments } from "../../state/environments";
import { SkillActionDialog, type SkillActionRequest } from "./SkillActionDialog";
import { SkillBackupsMenu } from "./SkillBackupsPanel";
import { SkillEnvironmentLoader, type SkillEnvironmentLiveState } from "./SkillEnvironmentLoader";
import { SkillsTable } from "./SkillsTable";
import { SkillView } from "./SkillView";
import { readCachedSkillInventory } from "./skillInventoryCache";
import {
  buildSkillGroups,
  buildSkillTargets,
  DEFAULT_SKILL_FILTERS,
  filterSkillGroups,
  type SkillEnvironmentInput,
  type SkillFilters,
} from "./skillsModel";

const DriverListSchema = Schema.mutable(Schema.Array(Schema.String));
/** Claude and Codex only until the user opts other providers in. */
const DEFAULT_SHOWN_DRIVERS = ["claudeAgent", "codex"];

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
  onSelectSkill,
}: {
  selectedSkill: string | null;
  onSelectSkill: (name: string | null) => void;
}) {
  const { environments: presentations } = useEnvironments();
  const [live, setLive] = useState<Record<string, SkillEnvironmentLiveState>>({});
  const [filters, setFilters] = useState<SkillFilters>(DEFAULT_SKILL_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focusedName, setFocusedName] = useState<string | null>(null);
  const [dialogRequest, setDialogRequest] = useState<SkillActionRequest | null>(null);
  const [shownDrivers, setShownDrivers] = useLocalStorage(
    "t3code:skills:shown-drivers",
    DEFAULT_SHOWN_DRIVERS,
    DriverListSchema,
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
  const hiddenCount = allDrivers.filter((driver) => !shownDrivers.includes(driver)).length;
  const visibleEnvironments = useMemo(
    () =>
      hiddenCount === 0
        ? environments
        : environments.map((env) =>
            env.inventory
              ? {
                  ...env,
                  inventory: {
                    ...env.inventory,
                    providers: env.inventory.providers.filter((provider) =>
                      shownDrivers.includes(provider.driver),
                    ),
                  },
                }
              : env,
          ),
    [environments, shownDrivers, hiddenCount],
  );
  const groups = useMemo(() => buildSkillGroups(visibleEnvironments), [visibleEnvironments]);
  const targets = useMemo(() => buildSkillTargets(visibleEnvironments), [visibleEnvironments]);
  const visibleRows = useMemo(() => filterSkillGroups(groups, filters), [groups, filters]);
  const skill = selectedSkill
    ? (groups.find((group) => group.name === selectedSkill) ?? null)
    : null;
  const skillIndex = skill ? visibleRows.findIndex((row) => row.name === skill.name) : -1;
  const loading =
    groups.length === 0 &&
    (connectedIds.some((id) => !live[id]) || Object.values(live).some((state) => state.isPending));

  const refreshAll = () => {
    for (const state of Object.values(live)) state.refresh();
  };
  const refreshEnvironment = (environmentId: EnvironmentId) => {
    live[environmentId]?.refresh();
  };
  const openSkill = useCallback(
    (name: string) => {
      setFocusedName(name);
      onSelectSkill(name);
    },
    [onSelectSkill],
  );
  const backToTable = useCallback(() => onSelectSkill(null), [onSelectSkill]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {connectedIds.map((environmentId) => (
        <SkillEnvironmentLoader
          key={environmentId}
          environmentId={environmentId}
          onUpdate={handleLiveUpdate}
        />
      ))}
      <WorkspacePageHeader electron={isElectron} className="justify-between border-b">
        <h1 className="text-sm font-semibold">Skills</h1>
        <div className="flex items-center gap-1">
          <Menu>
            <MenuTrigger
              render={<Button size="xs" variant="ghost" aria-label="Choose providers" />}
            >
              <SlidersHorizontalIcon className="size-3.5" />
              Providers
              {hiddenCount > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  {allDrivers.length - hiddenCount}/{allDrivers.length}
                </span>
              )}
            </MenuTrigger>
            <MenuPopup align="end">
              {allDrivers.map((driver) => (
                <MenuCheckboxItem
                  key={driver}
                  checked={shownDrivers.includes(driver)}
                  onCheckedChange={(checked) =>
                    setShownDrivers((current) =>
                      checked
                        ? [...new Set([...current, driver])]
                        : current.filter((shown) => shown !== driver),
                    )
                  }
                >
                  {PROVIDER_NAMES[driver] ?? driver}
                </MenuCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
          <SkillBackupsMenu environments={environments} onRefreshEnvironment={refreshEnvironment} />
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Refresh skills"
            onClick={refreshAll}
          >
            <RefreshIcon refreshing={Object.values(live).some((state) => state.isPending)} />
          </Button>
        </div>
      </WorkspacePageHeader>
      {skill ? (
        <SkillView
          key={skill.name}
          skill={skill}
          targets={targets}
          previousName={skillIndex > 0 ? visibleRows[skillIndex - 1]!.name : null}
          nextName={
            skillIndex >= 0 && skillIndex < visibleRows.length - 1
              ? visibleRows[skillIndex + 1]!.name
              : null
          }
          onNavigate={openSkill}
          onBack={backToTable}
          onRequestAction={setDialogRequest}
          dialogOpen={dialogRequest !== null}
        />
      ) : (
        <SkillsTable
          groups={groups}
          targets={targets}
          loading={loading}
          filters={filters}
          onFiltersChange={setFilters}
          selected={selected}
          onSelectedChange={setSelected}
          focusedName={focusedName}
          onFocusedNameChange={setFocusedName}
          onOpen={openSkill}
          onRequestAction={setDialogRequest}
        />
      )}
      <SkillActionDialog
        request={dialogRequest}
        onClose={() => setDialogRequest(null)}
        onRefreshEnvironment={refreshEnvironment}
      />
    </div>
  );
}
