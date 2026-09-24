import { createFileRoute, Link } from "@tanstack/react-router";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { SparklesIcon } from "lucide-react";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";
import { Button } from "../components/ui/button";

/**
 * Providers are machine state, so the page shows one environment at a time:
 * the chosen one, or the representative of the selection. A project crumb
 * narrows the candidates to the environments that project is registered on.
 */
function SettingsProvidersRoute() {
  const target = Route.useSearch();
  const { environment, scope } = useSettingsScope();
  if (!environment) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {scope.kind === "environment"
          ? `Reconnect ${scope.label} to set up its providers.`
          : "Connect an environment to set up its providers."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end px-4 pt-2">
        <Button size="sm" variant="ghost" render={<Link to="/skills" />}>
          <SparklesIcon className="size-3.5" />
          Manage skills
        </Button>
      </div>
      <ProviderSettingsPanel
        environmentId={environment.environmentId}
        {...(target.instanceId ? { instanceId: target.instanceId } : {})}
        scoped
      />
    </div>
  );
}

export const Route = createFileRoute("/settings/providers")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(typeof raw.environmentId === "string" && raw.environmentId.trim()
      ? { environmentId: EnvironmentId.make(raw.environmentId) }
      : {}),
    ...(typeof raw.instanceId === "string" && raw.instanceId.trim()
      ? { instanceId: ProviderInstanceId.make(raw.instanceId) }
      : {}),
  }),
  component: SettingsProvidersRoute,
});
