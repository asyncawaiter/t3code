import { useAtomValue } from "@effect/atom-react";
import { type Profile } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { profileSourceAtom, serverEnvironment } from "../state/server";
import { useEnvironments } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";

export function useProfilesLoaded() {
  const source = useAtomValue(profileSourceAtom);
  const { environments } = useEnvironments();
  return (
    !source.conflict &&
    source.config?.environment.capabilities.profileSynchronization === true &&
    environments.some(
      (env) => env.environmentId === source.sourceId && env.connection.phase === "connected",
    )
  );
}

// Read after the previous receipt so successive local edits use the committed collection.
let profileWrites = Promise.resolve();
export function useSaveProfiles() {
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const read = useAtomQueryRunner(serverEnvironment.settings, {
    reportFailure: false,
    refresh: true,
  });
  return useCallback(
    (update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>) => {
      const write = profileWrites.then(async () => {
        const source = appAtomRegistry.get(profileSourceAtom);
        if (source.conflict)
          throw new Error("Choose a shared profile source in Manage profiles before editing.");
        if (!source.sourceId || !source.config)
          throw new Error(
            "Connect the shared profile source to edit organization. Chats remain available on their hosts.",
          );
        if (source.config.environment.capabilities.profileSynchronization !== true)
          throw new Error(
            "Update the profile source to a build supporting profile synchronization.",
          );
        const result = await read({ environmentId: source.sourceId, input: {} });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (
          result.value.profileSyncSourceId &&
          result.value.profileSyncSourceId !== source.sourceId
        )
          throw new Error("The shared profile source changed. Wait for it to reconnect and retry.");
        const current = result.value.profiles;
        const profiles = update(current);
        if (profiles === current) return;
        const saved = await persist({
          environmentId: source.sourceId,
          input: {
            patch: { profiles, profileSyncSourceId: source.sourceId },
            baseProfiles: current,
          },
        });
        if (saved._tag === "Failure") throw squashAtomCommandFailure(saved);
      });
      profileWrites = write.catch(() => {});
      return write;
    },
    [persist, read],
  );
}
