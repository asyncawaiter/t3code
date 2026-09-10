import {
  ALL_PROFILE,
  profileForProject,
  spaceForThread,
  moveThreadsToSpace,
} from "@t3tools/contracts";
import { OUTSIDE_SPACES, moveProjectToProfile } from "@t3tools/client-runtime/state/profiles";
import { Alert, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useProfiles, useSaveProfiles } from "../../state/profiles";
import { chooseAction } from "../home/ProfilesPanel";
import { useNewTaskFlow } from "./new-task-flow-provider";
import type { QueuedThreadMessage } from "../../state/thread-outbox";

function confirmMove(name: string) {
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      "Move project?",
      `All chats in this project will move to ${name}. Old space assignments will be cleared.`,
      [
        { text: "Cancel", onPress: () => resolve(false) },
        { text: "Move", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export function useTaskOrganization() {
  const flow = useNewTaskFlow();
  const source = useProfiles();
  const save = useSaveProfiles();
  const prepare = async (message: QueuedThreadMessage) => {
    const projectKey = `${message.environmentId}:${message.creation?.projectId}`;
    const threadKey = `${message.environmentId}:${message.threadId}`;
    const owner = profileForProject(source.profiles, projectKey);
    const profileId = flow.organization.profileId ?? owner?.id;
    if (!profileId) return true;
    const profile = source.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("The selected profile was removed. Choose a new destination.");
    if (owner && owner.id !== profileId && !(await confirmMove(profile.name))) return false;
    const requestedSpace = flow.organization.spaceId;
    const spaceId = requestedSpace && requestedSpace !== OUTSIDE_SPACES ? requestedSpace : null;
    const previousSpace = owner && spaceForThread(owner, threadKey, projectKey);
    if (owner?.id === profileId && (previousSpace?.id ?? null) === spaceId) return true;
    await save((profiles) => {
      if (profileForProject(profiles, projectKey)?.id !== owner?.id)
        throw new Error("This project's profile changed. Review and retry.");
      const target = profiles.find((item) => item.id === profileId);
      if (!target || (spaceId && !target.spaces?.some((space) => space.id === spaceId)))
        throw new Error("The destination changed. Choose the profile and space again.");
      return moveProjectToProfile(profiles, projectKey, profileId).map((item) =>
        item.id === profileId
          ? moveThreadsToSpace(item, [{ threadKey, projectKey }], spaceId)
          : item,
      );
    });
    return true;
  };
  return { prepare };
}

export function NewTaskOrganization() {
  const flow = useNewTaskFlow();
  const source = useProfiles();
  const save = useSaveProfiles();
  const projectOwner =
    flow.selectedProject &&
    profileForProject(
      source.profiles,
      `${flow.selectedProject.environmentId}:${flow.selectedProject.id}`,
    );
  const profile =
    source.profiles.find((item) => item.id === flow.organization.profileId) ??
    (flow.organization.profileId === null ? projectOwner : undefined);
  const space = profile?.spaces?.find((item) => item.id === flow.organization.spaceId);
  const changeProfile = () =>
    chooseAction(
      "Profile for this chat",
      [ALL_PROFILE, ...source.profiles].map((item) => ({
        title: item.name,
        action: () =>
          flow.setOrganization({
            profileId: item.id === ALL_PROFILE.id ? null : item.id,
            spaceId: item.id === ALL_PROFILE.id ? null : OUTSIDE_SPACES,
          }),
      })),
    );
  const changeSpace = () =>
    chooseAction("Space for this chat", [
      {
        title: "Default",
        action: () =>
          flow.setOrganization({ profileId: profile?.id ?? null, spaceId: OUTSIDE_SPACES }),
      },
      ...(profile?.spaces ?? []).map((item) => ({
        title: item.name,
        action: () => flow.setOrganization({ profileId: profile?.id ?? null, spaceId: item.id }),
      })),
    ]);
  const saveDefault = async () => {
    const project = flow.selectedProject;
    if (!project || !profile || !space) return;
    const key = `${project.environmentId}:${project.id}`;
    const owner = profileForProject(source.profiles, key);
    if (owner && owner.id !== profile.id && !(await confirmMove(profile.name))) return;
    try {
      await save((profiles) => {
        if (profileForProject(profiles, key)?.id !== owner?.id)
          throw new Error("This project's profile changed. Review and retry.");
        if (
          !profiles
            .find((item) => item.id === profile.id)
            ?.spaces?.some((item) => item.id === space.id)
        )
          throw new Error("This space was removed.");
        return moveProjectToProfile(profiles, key, profile.id).map((item) =>
          item.id === profile.id
            ? {
                ...item,
                spaces: item.spaces?.map((entry) =>
                  entry.id === space.id
                    ? {
                        ...entry,
                        newChatDefaults: {
                          projectKey: key,
                          workspaceRoot: project.workspaceRoot,
                          deviceLabel:
                            flow.environments.find(
                              (env) => env.environmentId === project.environmentId,
                            )?.environmentLabel ?? "Device",
                          ...(flow.selectedModel ? { modelSelection: flow.selectedModel } : {}),
                          envMode: flow.workspaceMode,
                        },
                      }
                    : entry,
                ),
              }
            : item,
        );
      });
      Alert.alert(
        "Shortcut saved",
        `New chats in ${space.name} will start at ${project.workspaceRoot}.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not save shortcut",
        error instanceof Error ? error.message : "Please retry.",
      );
    }
  };
  return (
    <View className="w-full gap-1 px-4 py-2">
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose profile"
          onPress={changeProfile}
          className="min-h-11 flex-1 justify-center rounded-xl bg-subtle px-3"
        >
          <Text numberOfLines={1} className="text-sm text-foreground">
            {profile?.name ?? "All"}
          </Text>
        </Pressable>
        {profile && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose space"
            onPress={changeSpace}
            className="min-h-11 flex-1 justify-center rounded-xl bg-subtle px-3"
          >
            <Text numberOfLines={1} className="text-sm text-foreground">
              {space?.name ?? "Default"}
            </Text>
          </Pressable>
        )}
      </View>
      {space && flow.selectedProject && (
        <Pressable
          disabled={!source.writable}
          accessibilityRole="button"
          onPress={() => void saveDefault()}
          className="min-h-11 justify-center"
        >
          <Text className="text-xs text-foreground-muted">
            Use this device and folder as {space.name}'s default
          </Text>
        </Pressable>
      )}
    </View>
  );
}
