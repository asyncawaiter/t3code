import { organizationChangeLabel } from "../profileUndo";
import { toastManager } from "../components/ui/toast";
import { useAtomValue } from "@effect/atom-react";
import { mergeProfileEdits, type Profile } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback, useEffect } from "react";
import { profileEdits, profileEditsAtom } from "../state/profileEdits";
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
  const edits = useAtomValue(profileEditsAtom);
  if (!edits.loaded) return edits.error ?? "Loading saved organization edits.";
  if (!source.sourceId) return "Choose a profile source in Settings > General > Profiles.";
  if (!source.config && !source.profiles.length) return "Loading your saved profiles.";
  return null;
}

export function useProfileSyncConnection() {
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

export function useSaveProfiles() {
  return useCallback(
    async (update: (profiles: ReadonlyArray<Profile>) => ReadonlyArray<Profile>) => {
      const source = appAtomRegistry.get(profileSourceAtom);
      if (!source.sourceId) throw new Error("Choose a profile source before editing organization.");
      let before: ReadonlyArray<Profile> = source.profiles;
      let after: ReadonlyArray<Profile> = before;
      await profileEdits.edit(source.sourceId, source.profiles, (current) => {
        before = current;
        after = update(current);
        return after;
      });
      const title = organizationChangeLabel(before, after);
      if (title) {
        let restoring = false;
        toastManager.add({
          type: "success",
          title,
          timeout: 6000,
          actionProps: {
            children: "Undo",
            onClick: () => {
              if (restoring) return;
              restoring = true;
              void (async () => {
                const current = appAtomRegistry.get(profileSourceAtom);
                if (current.sourceId !== source.sourceId)
                  throw new Error(
                    "Switch back to the original profile source to undo this change.",
                  );
                await profileEdits.edit(source.sourceId!, current.profiles, (profiles) =>
                  mergeProfileEdits(profiles, after, before),
                );
              })().catch((error: unknown) => {
                restoring = false;
                toastManager.add({
                  type: "error",
                  title: "Could not undo placement",
                  description: error instanceof Error ? error.message : "Try again.",
                });
              });
            },
          },
        });
      }
    },
    [],
  );
}

export function useSyncProfileEdits() {
  const source = useAtomValue(profileSourceAtom);
  const edits = useAtomValue(profileEditsAtom);
  const connected = useProfileSyncConnection();

  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const read = useAtomQueryRunner(serverEnvironment.settings, {
    reportFailure: false,
    refresh: true,
  });
  const flush = useCallback(
    () =>
      profileEdits.flush({
        canSync: (id) => {
          const current = appAtomRegistry.get(profileSourceAtom);
          return (
            connected &&
            !current.conflict &&
            current.sourceId === id &&
            current.config?.environment.capabilities.profileSynchronization === true
          );
        },
        read: async (id) => {
          const result = await read({ environmentId: id, input: {} });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          return result.value;
        },
        save: async (id, profiles, baseProfiles) => {
          if (
            profiles.some((profile) =>
              profile.spaces?.some((space) => space.newChatDefaultsByDevice !== undefined),
            ) &&
            appAtomRegistry.get(profileSourceAtom).config?.environment.capabilities
              .spaceDeviceDefaults !== true
          )
            throw new Error(
              "Update the shared profile device to sync per-device Space defaults. Your changes are saved locally.",
            );
          const result = await persist({
            environmentId: id,
            input: { patch: { profiles, profileSyncSourceId: id }, baseProfiles },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        },
      }),
    [connected, persist, read],
  );
  useEffect(() => {
    if (connected && source.config && edits.draft) void flush();
  }, [connected, edits.draft, source.config, flush]);
  return { ...edits, retry: flush };
}
