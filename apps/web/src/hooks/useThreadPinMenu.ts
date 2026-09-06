import { useCallback } from "react";
import {
  profileForProject,
  spaceForThread,
  type ContextMenuItem,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { buildThreadPinMenu, type ThreadActionMenuId } from "../components/threadActionMenu.logic";
import { toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryServerSettingsAtom } from "../state/server";
import { readThreadShell } from "../state/entities";
import { useSaveProfiles } from "./useChatCreation";
import { usePrimarySettingsLoaded } from "./useSettings";
import { useThreadActions } from "./useThreadActions";

export function useThreadPinMenu() {
  const saveProfiles = useSaveProfiles();
  const { pinThread } = useThreadActions();
  const loaded = usePrimarySettingsLoaded();
  const getPinMenu = useCallback(
    (ref: ScopedThreadRef): ContextMenuItem<ThreadActionMenuId> => {
      const thread = readThreadShell(ref);
      const key = scopedThreadKey(ref);
      const projectKey = `${ref.environmentId}:${thread?.projectId}`;
      const profiles = appAtomRegistry.get(primaryServerSettingsAtom).profiles;
      return buildThreadPinMenu({
        profiles,
        threadKey: key,
        projectKey,
        isPinned: thread?.pinnedAt != null,
        loaded,
      });
    },
    [loaded],
  );
  const handlePinScope = useCallback(
    async (ref: ScopedThreadRef, action: string | null) => {
      if (
        action !== "pin-scope:global" &&
        action !== "pin-scope:profile" &&
        action !== "pin-scope:space"
      )
        return false;
      try {
        const thread = readThreadShell(ref);
        if (!thread) throw new Error("This thread is no longer available.");
        const key = scopedThreadKey(ref);
        const projectKey = `${ref.environmentId}:${thread.projectId}`;
        await saveProfiles((profiles) => {
          const owner = profileForProject(profiles, projectKey);
          const space = owner && spaceForThread(owner, key, projectKey);
          if (action !== "pin-scope:global" && !owner)
            throw new Error("Assign this project to a profile first.");
          if (action === "pin-scope:space" && !space)
            throw new Error("This thread is no longer assigned to a space.");
          return profiles.map((profile) => ({
            ...profile,
            threadPins: [
              ...(profile.threadPins ?? []).filter((pin) => pin.threadKey !== key),
              ...(profile.id === owner?.id && action !== "pin-scope:global"
                ? [
                    {
                      threadKey: key,
                      projectKey,
                      spaceId: action === "pin-scope:space" ? space!.id : null,
                    },
                  ]
                : []),
            ],
          }));
        });
        if (!thread.pinnedAt) {
          const result = await pinThread(ref);
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        }
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not pin thread",
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
      return true;
    },
    [saveProfiles, pinThread],
  );
  return { getPinMenu, handlePinScope };
}
