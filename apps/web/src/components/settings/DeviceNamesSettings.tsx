import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Input } from "../ui/input";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";

/**
 * Short names this client shows for each machine, in place of the name the
 * machine reports (often a stock hostname). Clearing a field restores it.
 */
export function DeviceNamesSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const aliases = useClientSettings((settings) => settings.environmentAliases);
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdateClientSettings();

  if (environments.length === 0) return null;

  const rename = (environmentId: string, value: string) => {
    const alias = value.trim();
    if ((aliases[environmentId] ?? "") === alias) return;
    const { [environmentId]: _previous, ...rest } = aliases;
    updateSettings({ environmentAliases: alias ? { ...rest, [environmentId]: alias } : rest });
  };

  const { id, title } = searchableSetting("device-names");
  const named = environments.filter((environment) => aliases[environment.environmentId]);
  return (
    <FoldedSettingsSection
      id={id}
      title={title}
      summary={named.length > 0 ? named.map((environment) => environment.label).join(" · ") : null}
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        Short names shown for each machine across this app. Leave a name empty to use the one the
        machine reports.
      </p>
      {environments.map((environment) => {
        const reported = environment.entry.target.label;
        const alias = aliases[environment.environmentId] ?? "";
        return (
          <EnvironmentRow
            key={environment.environmentId}
            kind={resolveEnvironmentMachineKind(environment.serverConfig)}
            label={reported}
            subtitle={environmentTransportLabel(environment)}
          >
            <Input
              // Remount when the saved name changes elsewhere so the field shows it.
              key={alias}
              size="compact"
              className="w-40"
              defaultValue={alias}
              placeholder={reported}
              disabled={!settingsHydrated}
              aria-label={`Name for ${reported}`}
              onBlur={(event) => rename(environment.environmentId, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = alias;
                  event.currentTarget.blur();
                }
              }}
            />
          </EnvironmentRow>
        );
      })}
    </FoldedSettingsSection>
  );
}
