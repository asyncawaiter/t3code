import { useOpenChatInColumns } from "./useOpenChatInColumns";
import { toastManager } from "../components/ui/toast";
import { OUTSIDE_SPACES } from "../components/sidebar/Spaces.logic";
import { useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { profileForProject, spaceForThread } from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useThreadShells } from "../state/entities";
import { usePrimarySettings } from "./useSettings";
import { selectSidebarSpace, useUiStateStore } from "../uiStateStore";
import { useWorkflowState } from "../workflowState";

/** Opens a known chat and reveals its organization, including across profiles/devices. */
export function useWorkflowNavigation() {
  const navigate = useNavigate();
  const openInColumns = useOpenChatInColumns();
  const dashboardReturn = useLocation({ select: (location) => location.state.dashboardReturn });
  const threads = useThreadShells();
  const profiles = usePrimarySettings((s) => s.profiles);
  return useCallback(
    (key: string) => {
      const thread = threads.find(
        (item) => scopedThreadKey(scopeThreadRef(item.environmentId, item.id)) === key,
      );
      if (!thread) return false;
      const projectKey = `${thread.environmentId}:${thread.projectId}`;
      const profile = profileForProject(profiles, projectKey);
      const profileId = profile?.id ?? "all";
      useWorkflowState.getState().visit(key, profileId);
      useUiStateStore.getState().setActiveProfileId(profile?.id ?? null);
      useUiStateStore.setState((state) =>
        selectSidebarSpace(
          state,
          profileId,
          profile ? (spaceForThread(profile, key, projectKey)?.id ?? OUTSIDE_SPACES) : null,
        ),
      );
      void openInColumns(thread)
        .then((opened) =>
          opened
            ? undefined
            : navigate({
                to: "/$environmentId/$threadId",
                params: { environmentId: thread.environmentId, threadId: thread.id },
                state: { dashboardReturn },
              }),
        )
        .catch((error: unknown) =>
          toastManager.add({
            type: "error",
            title: "Could not open chat",
            description: error instanceof Error ? error.message : "Try again.",
          }),
        );
      return true;
    },
    [threads, profiles, navigate, dashboardReturn, openInColumns],
  );
}
