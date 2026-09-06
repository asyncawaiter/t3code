import { EnvironmentId, Profile } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const Cache = Schema.Struct({ sourceId: EnvironmentId, profiles: Schema.Array(Profile) });
const key = "t3.shared-profile-cache.v1";
let snapshot: typeof Cache.Type | null = null;
try {
  const stored = globalThis.localStorage?.getItem(key);
  if (stored) snapshot = Schema.decodeUnknownSync(Cache)(JSON.parse(stored));
} catch {
  /* A missing or obsolete cache does not affect server data. */
}

export function readProfileCache() {
  return snapshot;
}
export function cacheProfiles(value: typeof Cache.Type) {
  if (snapshot?.sourceId === value.sourceId && snapshot.profiles === value.profiles) return;
  snapshot = value;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Organization remains cached in memory if storage is unavailable. */
  }
}
