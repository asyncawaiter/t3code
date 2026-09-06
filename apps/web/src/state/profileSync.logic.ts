import type { EnvironmentId, ServerSettings } from "@t3tools/contracts";
import * as Equal from "effect/Equal";

/** Discover one source, preserving divergent legacy collections until the user chooses. */
export function resolveProfileSource(
  configs: ReadonlyMap<
    EnvironmentId,
    { settings: Pick<ServerSettings, "profiles" | "profileSyncSourceId"> }
  >,
  primaryId: EnvironmentId | null,
) {
  const sources = new Set(
    [...configs.values()].flatMap((config) =>
      config.settings.profileSyncSourceId ? [config.settings.profileSyncSourceId] : [],
    ),
  );
  if (sources.size > 1) return { sourceId: null, conflict: true };
  const explicit = [...sources][0];
  if (explicit) return { sourceId: explicit, conflict: false };
  const populated = [...configs].filter(([, config]) => config.settings.profiles.length > 0);
  if (
    populated.some(
      ([, config]) => !Equal.equals(config.settings.profiles, populated[0]?.[1].settings.profiles),
    )
  ) {
    return { sourceId: null, conflict: true };
  }
  const sourceId = populated.map(([id]) => id).sort()[0] ?? primaryId;
  return { sourceId, conflict: false };
}
