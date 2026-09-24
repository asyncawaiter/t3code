import * as Schema from "effect/Schema";
import { SkillInventory, type EnvironmentId } from "@t3tools/contracts";

import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";

const CachedSkillInventory = Schema.Struct({
  inventory: SkillInventory,
  checkedAt: Schema.String,
});

function cacheKey(environmentId: EnvironmentId): string {
  return `t3.skills.last-inventory.${environmentId}`;
}

/** Last inventory this environment reported, so an offline device's skills stay visible. */
export function readCachedSkillInventory(environmentId: EnvironmentId): SkillInventory | null {
  return getLocalStorageItem(cacheKey(environmentId), CachedSkillInventory)?.inventory ?? null;
}

export function writeCachedSkillInventory(
  environmentId: EnvironmentId,
  inventory: SkillInventory,
): void {
  setLocalStorageItem(
    cacheKey(environmentId),
    { inventory, checkedAt: new Date().toISOString() },
    CachedSkillInventory,
  );
}
