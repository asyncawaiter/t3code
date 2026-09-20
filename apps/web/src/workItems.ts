import { create } from "zustand";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { type EnvironmentId, type WorkItem } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { environmentServerConfigsAtom, serverEnvironment } from "./state/server";
import { useAtomCommand } from "./state/use-atom-command";
import { appAtomRegistry } from "./rpc/atomRegistry";

export type LocatedWorkItem = { environmentId: EnvironmentId; item: WorkItem };
export type WorkItemRequest = Partial<LocatedWorkItem> & {
  source?: WorkItem["source"];
  notes?: string;
  attachments?: WorkItem["attachments"];
  profileId?: string | null;
  spaceId?: string | null;
  projectId?: WorkItem["projectId"];
};
export const useWorkItemEditor = create<{ request: WorkItemRequest | null }>(() => ({
  request: null,
}));
export function openWorkItem(request: WorkItemRequest = {}) {
  useWorkItemEditor.setState({ request });
}

export function useWorkItems() {
  const configs = useAtomValue(environmentServerConfigsAtom);
  return useMemo(
    () =>
      [...configs].flatMap(([environmentId, config]) =>
        (config.settings.workItems ?? []).map((item) => ({ environmentId, item })),
      ),
    [configs],
  );
}

export function useSaveWorkItem() {
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  return async (environmentId: EnvironmentId, item: WorkItem, base?: WorkItem) => {
    if (
      !appAtomRegistry.get(environmentServerConfigsAtom).get(environmentId)?.environment
        .capabilities.workItems
    )
      throw new Error("Update this device before saving tasks to it.");
    const result = await update({
      environmentId,
      input: {
        patch: { workItems: [item] },
        baseWorkItems: base ? [base] : [],
      },
    });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    return result.value.workItems?.find((saved) => saved.id === item.id) ?? item;
  };
}
