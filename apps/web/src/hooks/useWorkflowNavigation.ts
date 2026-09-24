import { useOpenChatInColumns } from "./useOpenChatInColumns";
import { toastManager } from "../components/ui/toast";
import { OUTSIDE_SPACES } from "../components/sidebar/Spaces.logic";
import { useCallback, useRef } from "react";
import { useNavigate, useLocation, useRouter } from "@tanstack/react-router";
import { profileForProject, spaceForThread } from "@t3tools/contracts";
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { readThreadShell, useAllEnvironmentShellsBootstrapped } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import { orchestrationEnvironment } from "../state/orchestration";
import { usePrimarySettings } from "./useSettings";
import { selectSidebarSpace, useUiStateStore } from "../uiStateStore";
import { useWorkflowState } from "../workflowState";

/** Finds active or archived chats without changing board membership or chat state. */
export function useWorkflowNavigation() {
  const navigate = useNavigate();
  const router = useRouter();
  const openInColumns = useOpenChatInColumns();
  const dashboardReturn = useLocation({ select: (location) => location.state.dashboardReturn });
  const profiles = usePrimarySettings((s) => s.profiles);
  const { environments } = useEnvironments();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const readArchive = useAtomQueryRunner(orchestrationEnvironment.archivedShellSnapshot, {
    reportFailure: false,
    refresh: true,
  });
  const request = useRef(0);
  return useCallback(
    (key: string) => {
      const ref = parseScopedThreadKey(key);
      if (!ref) return false;
      const sequence = ++request.current;
      const origin = router.state.location.href;
      const connections = {
        children: "Connections",
        onClick: () => void navigate({ to: "/settings/connections" }),
      };
      void (async () => {
        let thread = readThreadShell(ref);
        if (!thread) {
          const device = environments.find((item) => item.environmentId === ref.environmentId);
          if (!device || device.connection.phase !== "connected") {
            toastManager.add({
              type: "info",
              title: device ? `${device.label} is offline` : "Chat device unavailable",
              description:
                "Reconnect its device to open this chat. Your bookmark and saved destination are unchanged.",
              actionProps: connections,
            });
            return;
          }
          if (!bootstrapped) {
            toastManager.add({
              type: "info",
              title: "Chats are still loading",
              description: "Try the locator again when this device has finished loading.",
            });
            return;
          }
          const loading = toastManager.add({
            type: "info",
            title: "Looking for saved chat",
            description: "Checking archived chats on this device.",
            timeout: 0,
          });
          let archived;
          try {
            archived = await readArchive({ environmentId: ref.environmentId, input: {} });
          } finally {
            toastManager.close(loading);
          }
          if (sequence !== request.current || router.state.location.href !== origin) return;
          if (archived._tag === "Failure") {
            toastManager.add({
              type: "error",
              title: "Could not check archived chats",
              description: "Your bookmark is unchanged. Check the connection and try again.",
              actionProps: connections,
            });
            return;
          }
          const found = archived.value.threads.find((item) => item.id === ref.threadId);
          thread =
            readThreadShell(ref) ?? (found ? { ...found, environmentId: ref.environmentId } : null);
          if (!thread) {
            const bookmarked = useUiStateStore.getState().bookmarkedThreadKey === key;
            toastManager.add({
              type: "info",
              title: "Chat not found",
              description:
                "The device is connected, but this chat is no longer in active or archived chats. It may have been deleted.",
              ...(bookmarked
                ? {
                    actionProps: {
                      children: "Remove bookmark",
                      onClick: () => {
                        if (useUiStateStore.getState().bookmarkedThreadKey === key)
                          useUiStateStore.setState({ bookmarkedThreadKey: null });
                      },
                    },
                  }
                : {}),
            });
            return;
          }
        }
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
        if (await openInColumns(thread)) {
          if (thread.archivedAt)
            toastManager.add({
              type: "info",
              title: "Opened archived chat",
              description: "Opened as a reference. It remains archived.",
              timeout: 5000,
            });
          return;
        }
        await navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: thread.environmentId, threadId: thread.id },
          state: { dashboardReturn },
        });
      })().catch((error: unknown) =>
        toastManager.add({
          type: "error",
          title: "Could not open chat",
          description: error instanceof Error ? error.message : "Try again.",
        }),
      );
      return true;
    },
    [
      profiles,
      environments,
      bootstrapped,
      readArchive,
      navigate,
      router,
      dashboardReturn,
      openInColumns,
    ],
  );
}
