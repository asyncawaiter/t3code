import { useAtomValue } from "@effect/atom-react";
import { type Profile } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";
import { saveSharedProfiles } from "@t3tools/client-runtime/state/profiles";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { profileSourceAtom, serverEnvironment } from "../state/server";
import { useEnvironments } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";

export function useProfilesLoaded() {
  return useProfileWriteBlockReason() === null;
}

export function useProfileWriteBlockReason(): string | null {
  const source = useAtomValue(profileSourceAtom);
  const { environments } = useEnvironments();
  if (source.conflict)
    return "Devices have conflicting profile sources. Choose one in Settings > General > Profiles.";
  const environment = environments.find((env) => env.environmentId === source.sourceId);
  const label = environment?.label ?? "the shared profile source";
  if (environment?.connection.phase !== "connected")
    return `Connect ${label} to save Space changes or open a chat in this Space.`;
  if (!source.config) return `Loading profiles from ${label}.`;
  if (source.config.environment.capabilities.profileSynchronization !== true)
    return `Update ${label} to a version that supports shared profiles.`;
  return null;
}

export function useSaveProfiles() {
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const read = useAtomQueryRunner(serverEnvironment.settings, {
    reportFailure: false,
    refresh: true,
  });
  return useCallback(
    (update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>) =>
      saveSharedProfiles(update, {
        getSource: () => appAtomRegistry.get(profileSourceAtom),
        read: async (id) => {
          const result = await read({ environmentId: id, input: {} });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          return result.value;
        },
        save: async (id, profiles, baseProfiles) => {
          const result = await persist({
            environmentId: id,
            input: { patch: { profiles, profileSyncSourceId: id }, baseProfiles },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        },
      }),
    [persist, read],
  );
}
