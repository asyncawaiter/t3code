import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "../rpc/atomRegistry";

type EnvironmentAliases = Readonly<Record<string, string>>;

/**
 * The display names set in Settings > Connections, keyed by environment id.
 * Client settings publish into this atom so environment state can relabel
 * machines without importing the settings hooks, which import that state.
 */
export const environmentAliasesAtom = Atom.make<EnvironmentAliases>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("web-environment-aliases"),
);

export function publishEnvironmentAliases(aliases: EnvironmentAliases): void {
  if (appAtomRegistry.get(environmentAliasesAtom) !== aliases) {
    appAtomRegistry.set(environmentAliasesAtom, aliases);
  }
}

/** The alias for an environment when one is set, otherwise the name it reports. */
export function aliasedEnvironmentLabel(
  aliases: EnvironmentAliases,
  environmentId: EnvironmentId,
  label: string,
): string {
  return aliases[environmentId] ?? label;
}
