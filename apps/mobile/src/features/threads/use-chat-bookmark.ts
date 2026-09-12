import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback } from "react";
import { Alert } from "react-native";
import { resolveChatFocus } from "@t3tools/client-runtime/state/chat-bookmark";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useThreadShells } from "../../state/entities";
import { revealProfileThread } from "../../state/profiles";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";

export function useChatBookmark(currentThreadKey: string | null) {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom, { mode: "promise" });
  const threads = useThreadShells();
  const navigation = useNavigation();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  const loaded = AsyncResult.isSuccess(preferences);
  const key = loaded ? (preferences.value.bookmarkedThreadKey ?? null) : null;
  const returnThreadKey = loaded ? (preferences.value.bookmarkReturnThreadKey ?? null) : null;
  const target = resolveChatFocus(key, returnThreadKey, currentThreadKey);
  const targetThreadKey = target?.threadKey;
  const nextReturnThreadKey = target?.returnThreadKey;
  const targetThread = threads.find(
    (thread) => `${thread.environmentId}:${thread.id}` === targetThreadKey,
  );
  const toggle = useCallback(
    (threadKey: string) => {
      if (!loaded) return;
      void save({
        bookmarkedThreadKey: key === threadKey ? null : threadKey,
        bookmarkReturnThreadKey: null,
      }).catch(() => Alert.alert("Could not save bookmark", "Please retry."));
    },
    [key, loaded, save],
  );
  const focus = useCallback(() => {
    if (!targetThreadKey) return;
    if (!targetThread || targetThread.archivedAt !== null) {
      Alert.alert(
        "Focus chat unavailable",
        targetThread?.archivedAt
          ? "Restore this chat from Settings > Archive, or bookmark another chat."
          : "Reconnect its device, or bookmark another chat.",
      );
      return;
    }
    void save({ bookmarkReturnThreadKey: nextReturnThreadKey }).catch(() =>
      Alert.alert("Could not save return point", "Please retry."),
    );
    revealProfileThread(targetThread);
    navigation.navigate("Thread", {
      environmentId: targetThread.environmentId,
      threadId: targetThread.id,
    });
    if (layout.usesSplitView && !panes.primarySidebarVisible) togglePrimarySidebar();
  }, [
    targetThreadKey,
    nextReturnThreadKey,
    targetThread,
    save,
    navigation,
    layout.usesSplitView,
    panes.primarySidebarVisible,
    togglePrimarySidebar,
  ]);
  return { key, returnThreadKey, loaded, toggle, focus, targetTitle: targetThread?.title };
}
