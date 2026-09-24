import { useEffect } from "react";
import type { EnvironmentId, SkillInventory } from "@t3tools/contracts";

import { useEnvironmentQuery } from "../../state/query";
import { skillInventory } from "../../state/skills";
import { writeCachedSkillInventory } from "./skillInventoryCache";

export interface SkillEnvironmentLiveState {
  environmentId: EnvironmentId;
  inventory: SkillInventory | null;
  isPending: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Mounted once per connected environment so the skill inventory query only runs while the
 * Skills page is open. Reports its state up and caches a successful inventory for the
 * environment's offline view.
 */
export function SkillEnvironmentLoader({
  environmentId,
  onUpdate,
}: {
  environmentId: EnvironmentId;
  onUpdate: (state: SkillEnvironmentLiveState) => void;
}) {
  const { data, error, isPending, refresh } = useEnvironmentQuery(
    skillInventory({ environmentId, input: {} }),
  );

  useEffect(() => {
    onUpdate({ environmentId, inventory: data, isPending, error, refresh });
  }, [environmentId, data, isPending, error, onUpdate, refresh]);

  useEffect(() => {
    if (data) writeCachedSkillInventory(environmentId, data);
  }, [environmentId, data]);

  return null;
}
