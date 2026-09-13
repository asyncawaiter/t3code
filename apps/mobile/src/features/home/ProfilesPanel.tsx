import { useChatBookmark } from "../threads/use-chat-bookmark";
import { useAtomValue } from "@effect/atom-react";
import { environmentServerConfigsAtom } from "../../state/server";
import {
  ALL_PROFILE,
  type Profile,
  type ProfileSpace,
  mergeProfileEdits,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_MAX_COUNT,
} from "@t3tools/contracts";
import {
  OUTSIDE_SPACES,
  moveProjectToProfile,
  profileSpaceCounts,
} from "@t3tools/client-runtime/state/profiles";
import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { cn } from "../../lib/cn";
import {
  selectProfile,
  selectSpace,
  useChooseProfileSource,
  useProfiles,
  useProfileSync,
  useSaveProfiles,
} from "../../state/profiles";
import { useProjects, useThreadShells } from "../../state/entities";
import { useWorkspaceState } from "../../state/workspace";

export function chooseAction(
  title: string,
  choices: ReadonlyArray<{ title: string; action: () => void; destructive?: boolean }>,
) {
  if (Platform.OS === "ios")
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...choices.map((choice) => choice.title), "Cancel"],
        cancelButtonIndex: choices.length,
        ...(choices.some((choice) => choice.destructive)
          ? { destructiveButtonIndex: choices.findIndex((choice) => choice.destructive) }
          : {}),
      },
      (index) => choices[index]?.action(),
    );
  else
    Alert.alert(title, undefined, [
      ...choices.map((choice) => ({ text: choice.title, onPress: choice.action })),
      { text: "Cancel" },
    ]);
}

export function ProfilesPanel(props: { currentThreadKey?: string | null }) {
  const bookmark = useChatBookmark(props.currentThreadKey ?? null);
  const state = useProfiles();
  const sync = useProfileSync();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const save = useSaveProfiles();
  const chooseSource = useChooseProfileSource();
  const { environments } = useWorkspaceState();
  const projects = useProjects();
  const threads = useThreadShells();
  const navigation = useNavigation();
  const [editor, setEditor] = useState<{
    kind: "profile" | "space";
    id?: string;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{
    profileId: string;
    space: ProfileSpace;
    pins: NonNullable<Profile["threadPins"]>;
    index: number;
  } | null>(null);
  const run = (action: () => Promise<unknown>) => {
    void action().catch((error: unknown) =>
      Alert.alert(
        "Could not update organization",
        error instanceof Error ? error.message : "Please retry.",
      ),
    );
  };
  const replace = (profiles: ReadonlyArray<Profile>) =>
    save((current) => mergeProfileEdits(current, state.profiles, profiles));
  const updateProfile = (profile: Profile) =>
    replace(state.profiles.map((item) => (item.id === profile.id ? profile : item)));
  const sourceMenu = () =>
    chooseAction(
      "Shared profile source",
      environments
        .filter(
          (env) =>
            env.connectionState === "connected" &&
            configs.get(env.environmentId)?.environment.capabilities.profileSynchronization,
        )
        .map((env) => ({
          title: env.environmentLabel,
          action: () => run(() => chooseSource(env.environmentId)),
        })),
    );
  const profileMenu = () =>
    chooseAction("Profiles", [
      { title: "Dashboard", action: () => navigation.navigate("Dashboard") },
      ...(state.writable
        ? [
            {
              title: "New profile",
              action: () => setEditor({ kind: "profile" as const, name: "" }),
            },
          ]
        : []),
      ...(!state.writable || state.profile.id === ALL_PROFILE.id
        ? []
        : [
            {
              title: "Rename profile",
              action: () =>
                setEditor({ kind: "profile", id: state.profile.id, name: state.profile.name }),
            },
            {
              title: "Reorder profile",
              action: () =>
                chooseAction("Place before", [
                  ...state.profiles
                    .filter((item) => item.id !== state.profile.id)
                    .map((item) => ({
                      title: item.name,
                      action: () =>
                        run(() => {
                          const reordered = state.profiles.filter(
                            (entry) => entry.id !== state.profile.id,
                          );
                          reordered.splice(
                            reordered.findIndex((entry) => entry.id === item.id),
                            0,
                            state.profile,
                          );
                          return replace(reordered);
                        }),
                    })),
                  {
                    title: "Move to end",
                    action: () =>
                      run(() =>
                        replace([
                          ...state.profiles.filter((item) => item.id !== state.profile.id),
                          state.profile,
                        ]),
                      ),
                  },
                ]),
            },
            {
              title: "Add or move project here",
              action: () =>
                chooseAction(
                  "Moving a project includes all its chats",
                  projects.map((project) => ({
                    title: `${project.title} · ${project.workspaceRoot}`,
                    action: () => {
                      const key = `${project.environmentId}:${project.id}`;
                      const move = () =>
                        run(() =>
                          save((current) => moveProjectToProfile(current, key, state.profile.id)),
                        );
                      const owner = state.profiles.find((profile) =>
                        profile.projectKeys.includes(key),
                      );
                      if (!owner || owner.id === state.profile.id) return move();
                      Alert.alert(
                        `Move ${project.title}?`,
                        `All its chats move from ${owner.name} to ${state.profile.name}. Existing space assignments are cleared.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Move project", onPress: move },
                        ],
                      );
                    },
                  })),
                ),
            },
            {
              title: "Delete profile",
              destructive: true,
              action: () =>
                Alert.alert("Delete profile?", "Projects and chats remain available in All.", [
                  { text: "Cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                      run(async () => {
                        await replace(
                          state.profiles.filter((item) => item.id !== state.profile.id),
                        );
                        selectProfile(null);
                      }),
                  },
                ]),
            },
          ]),
      { title: "Shared source", action: sourceMenu },
    ]);
  const requireWritable = () => {
    if (state.writable) return true;
    Alert.alert(
      "Space changes unavailable",
      sync.error ?? "Loading saved organization. Try again when your profiles appear.",
    );
    return false;
  };
  const spaceMenu = (space: ProfileSpace) => {
    if (!requireWritable()) return;
    chooseAction(space.name, [
      {
        title: "Rename",
        action: () => setEditor({ kind: "space", id: space.id, name: space.name }),
      },
      {
        title: "Reorder",
        action: () =>
          chooseAction("Place before", [
            ...(state.profile.spaces ?? [])
              .filter((item) => item.id !== space.id)
              .map((item) => ({
                title: item.name,
                action: () =>
                  run(() => {
                    const spaces = (state.profile.spaces ?? []).filter(
                      (entry) => entry.id !== space.id,
                    );
                    spaces.splice(
                      spaces.findIndex((entry) => entry.id === item.id),
                      0,
                      space,
                    );
                    return updateProfile({ ...state.profile, spaces });
                  }),
              })),
            {
              title: "Move to end",
              action: () =>
                run(() =>
                  updateProfile({
                    ...state.profile,
                    spaces: [
                      ...(state.profile.spaces ?? []).filter((item) => item.id !== space.id),
                      space,
                    ],
                  }),
                ),
            },
          ]),
      },
      {
        title: "Clear new-chat defaults",
        action: () =>
          run(() =>
            updateProfile({
              ...state.profile,
              spaces: state.profile.spaces?.map((item) =>
                item.id === space.id ? { ...item, newChatDefaults: undefined } : item,
              ),
            }),
          ),
      },
      {
        title: "Delete space",
        destructive: true,
        action: () =>
          Alert.alert("Delete space?", "Its chats and pins return directly to the profile.", [
            { text: "Cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                run(async () => {
                  const index =
                    state.profile.spaces?.findIndex((item) => item.id === space.id) ?? 0;
                  await updateProfile({
                    ...state.profile,
                    spaces: state.profile.spaces?.filter((item) => item.id !== space.id),
                    threadPins: state.profile.threadPins?.map((pin) =>
                      pin.spaceId === space.id ? { ...pin, spaceId: null } : pin,
                    ),
                  });
                  setDeleted({
                    profileId: state.profile.id,
                    space,
                    index,
                    pins: state.profile.threadPins?.filter((pin) => pin.spaceId === space.id) ?? [],
                  });
                  if (state.spaceId === space.id) selectSpace(OUTSIDE_SPACES);
                }),
            },
          ]),
      },
    ]);
  };
  const launchSpace = (space: ProfileSpace) => {
    const defaults = space.newChatDefaults;
    const project = projects.find(
      (item) => `${item.environmentId}:${item.id}` === defaults?.projectKey,
    );
    const openPicker = () => {
      if (!requireWritable()) return;
      selectSpace(space.id);
      navigation.navigate("NewTaskSheet", { screen: "NewTask" });
    };
    if (!defaults) return openPicker();
    chooseAction(`${defaults.deviceLabel}\n${defaults.workspaceRoot}`, [
      {
        title: "Open new chat",
        action: () => {
          if (!requireWritable()) return;
          if (
            !project ||
            !environments.some(
              (env) =>
                env.environmentId === project.environmentId && env.connectionState === "connected",
            )
          )
            return Alert.alert(
              "Destination unavailable",
              "Connect this device or choose another location.",
            );
          selectSpace(space.id);
          navigation.navigate("NewTaskSheet", {
            screen: "NewTaskDraft",
            params: {
              environmentId: project.environmentId,
              projectId: project.id,
              title: project.title,
            },
          });
        },
      },
      { title: "Change destination", action: openPicker },
    ]);
  };
  const counts = useMemo(
    () => profileSpaceCounts(state.profiles, state.profile.id, threads),
    [state.profiles, state.profile.id, threads],
  );
  const submit = async () => {
    if (!editor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const name = editor.name.trim();
      if (!name || name.length > PROFILE_NAME_MAX_LENGTH)
        throw new Error(`Use a name of 1 to ${PROFILE_NAME_MAX_LENGTH} characters.`);
      if (editor.kind === "profile") {
        if (!editor.id && state.profiles.length >= PROFILE_MAX_COUNT)
          throw new Error("Profile limit reached.");
        const id = editor.id ?? randomUUID();
        await replace(
          editor.id
            ? state.profiles.map((item) => (item.id === id ? { ...item, name } : item))
            : [...state.profiles, { id, name, color: "gray", projectKeys: [] }],
        );
        if (!editor.id) selectProfile(id);
      } else {
        const spaces = state.profile.spaces ?? [];
        if (!editor.id && spaces.length >= 64) throw new Error("Space limit reached.");
        await updateProfile({
          ...state.profile,
          spaces: editor.id
            ? spaces.map((item) => (item.id === editor.id ? { ...item, name } : item))
            : [...spaces, { id: randomUUID(), name, threads: [] }],
        });
      }
      setEditor(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-3 px-3 py-2">
      <View className="flex-row items-center gap-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={{ gap: 6 }}
        >
          {[ALL_PROFILE, ...state.profiles].map((profile) => (
            <Pressable
              key={profile.id}
              accessibilityRole="button"
              accessibilityLabel={profile.name}
              accessibilityState={{ selected: profile.id === state.profile.id }}
              onPress={() => selectProfile(profile.id === ALL_PROFILE.id ? null : profile.id)}
              className={cn(
                "min-h-11 min-w-11 items-center justify-center rounded-full px-3",
                profile.id === state.profile.id ? "bg-foreground" : "bg-subtle",
              )}
            >
              <Text
                numberOfLines={1}
                className={cn(
                  "font-t3-medium",
                  profile.id === state.profile.id ? "text-screen" : "text-foreground-muted",
                )}
              >
                {profile.id === state.profile.id
                  ? profile.name
                  : profile.name.slice(0, 2).toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {bookmark.key ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Focus saved chat"
            accessibilityHint={`Return to ${bookmark.targetTitle ?? "saved chat"}`}
            onPress={bookmark.focus}
            className="size-11 items-center justify-center"
          >
            <SymbolView name="scope" size={20} tintColorClassName="accent-foreground" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Manage profiles"
          accessibilityRole="button"
          onPress={profileMenu}
          className="size-11 items-center justify-center"
        >
          <SymbolView name="ellipsis" size={20} tintColorClassName="accent-icon-muted" />
        </Pressable>
      </View>
      {sync.pending && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              "Pending organization sync",
              sync.error ??
                "Edits are saved on this device and sync when the shared source reconnects.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Retry", onPress: sync.retry },
                {
                  text: "Discard pending edits",
                  style: "destructive",
                  onPress: () =>
                    void sync
                      .discard()
                      .catch((error: unknown) =>
                        Alert.alert("Could not discard edits", String(error)),
                      ),
                },
              ],
            )
          }
        >
          <Text className="text-xs text-foreground-muted">
            {sync.error ? "Organization needs attention" : "Pending sync"}
          </Text>
        </Pressable>
      )}
      {sync.failed && (
        <Pressable
          accessibilityRole="button"
          onPress={sync.retry}
          className="min-h-11 justify-center"
        >
          <Text className="text-xs text-foreground-muted">
            Profile sync needs attention. Tap to retry.
          </Text>
        </Pressable>
      )}
      {(!state.writable || state.conflict) && (
        <Pressable onPress={sourceMenu} accessibilityRole="button">
          <Text className="text-xs text-foreground-muted">
            {sync.error ??
              (state.conflict
                ? "Choose the shared profile source"
                : state.sourceId
                  ? "Loading saved organization. Sync requires the shared source."
                  : "Choose a device to store shared profiles")}
          </Text>
        </Pressable>
      )}
      <View className="gap-2 rounded-2xl bg-subtle p-2">
        <View className="flex-row items-center justify-between pl-2">
          <Text className="text-sm text-foreground-muted">{state.profile.name} / Spaces</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: state.spaceId === null }}
            onPress={() => selectSpace(null)}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-xs text-foreground-muted">All chats</Text>
          </Pressable>
          {state.profile.id !== ALL_PROFILE.id ? (
            <Pressable
              disabled={!state.writable}
              accessibilityLabel="New space"
              accessibilityRole="button"
              onPress={() => setEditor({ kind: "space", name: "" })}
              className="size-11 items-center justify-center"
            >
              <SymbolView name="plus" size={18} tintColorClassName="accent-icon-muted" />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row flex-wrap gap-2">
          <View
            style={{ width: "48.5%", minHeight: 104 }}
            className={cn(
              "rounded-2xl p-2",
              state.spaceId === OUTSIDE_SPACES ? "bg-foreground" : "bg-card",
            )}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Default space"
              accessibilityState={{ selected: state.spaceId === OUTSIDE_SPACES }}
              onPress={() => selectSpace(OUTSIDE_SPACES)}
              className="min-h-11 flex-1 justify-center"
            >
              <Text
                className={cn(
                  "font-t3-medium",
                  state.spaceId === OUTSIDE_SPACES ? "text-screen" : "text-foreground",
                )}
              >
                Default
              </Text>
              <Text
                className={cn(
                  "text-xs",
                  state.spaceId === OUTSIDE_SPACES ? "text-screen" : "text-foreground-muted",
                )}
              >
                Unassigned chats
              </Text>
            </Pressable>
            <View className="flex-row items-center justify-between">
              <Text
                className={cn(
                  "text-xs",
                  state.spaceId === OUTSIDE_SPACES ? "text-screen" : "text-foreground-muted",
                )}
              >
                {counts.get(OUTSIDE_SPACES) ?? 0} chats
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New chat in Default"
                className="size-11 items-center justify-center"
                onPress={() => {
                  selectSpace(OUTSIDE_SPACES);
                  navigation.navigate("NewTaskSheet", { screen: "NewTask" });
                }}
              >
                <Text
                  className={state.spaceId === OUTSIDE_SPACES ? "text-screen" : "text-foreground"}
                >
                  +
                </Text>
              </Pressable>
            </View>
          </View>
          {state.profile.spaces?.map((space) => (
            <View
              key={space.id}
              style={{ width: "48.5%", minHeight: 104 }}
              className={cn(
                "rounded-2xl p-2",
                state.spaceId === space.id ? "bg-foreground" : "bg-card",
              )}
            >
              <View className="flex-row">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: state.spaceId === space.id }}
                  accessibilityLabel={`Open ${space.name}`}
                  onPress={() =>
                    selectSpace(state.spaceId === space.id ? OUTSIDE_SPACES : space.id)
                  }
                  className="min-h-11 flex-1 justify-center"
                >
                  <Text
                    numberOfLines={1}
                    className={cn(
                      "font-t3-medium",
                      state.spaceId === space.id ? "text-screen" : "text-foreground",
                    )}
                  >
                    {space.name}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Manage ${space.name}`}
                  onPress={() => spaceMenu(space)}
                  className="size-11 items-center justify-center"
                >
                  <Text
                    className={state.spaceId === space.id ? "text-screen" : "text-foreground-muted"}
                  >
                    ···
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row items-center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${space.name}`}
                  className="flex-1"
                  onPress={() =>
                    selectSpace(state.spaceId === space.id ? OUTSIDE_SPACES : space.id)
                  }
                >
                  <Text
                    numberOfLines={1}
                    className={cn(
                      "text-xs",
                      state.spaceId === space.id ? "text-screen" : "text-foreground-muted",
                    )}
                  >
                    {`${counts.get(space.id) ?? 0} chats`}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`New chat in ${space.name}`}
                  onPress={() => launchSpace(space)}
                  className="size-11 items-center justify-center"
                >
                  <Text className={state.spaceId === space.id ? "text-screen" : "text-foreground"}>
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        {deleted?.profileId === state.profile.id && (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center px-2"
            onPress={() =>
              run(async () => {
                const spaces = [...(state.profile.spaces ?? [])];
                spaces.splice(deleted.index, 0, {
                  ...deleted.space,
                  threads: deleted.space.threads.filter(
                    (thread) =>
                      state.profile.projectKeys.includes(thread.projectKey) &&
                      !spaces.some((space) =>
                        space.threads.some((item) => item.threadKey === thread.threadKey),
                      ),
                  ),
                });
                await updateProfile({
                  ...state.profile,
                  spaces,
                  threadPins: state.profile.threadPins?.map((pin) =>
                    pin.spaceId === null &&
                    deleted.pins.some((old) => old.threadKey === pin.threadKey) &&
                    spaces
                      .find((space) => space.id === deleted.space.id)
                      ?.threads.some((thread) => thread.threadKey === pin.threadKey)
                      ? { ...pin, spaceId: deleted.space.id }
                      : pin,
                  ),
                });
                setDeleted(null);
              })
            }
          >
            <Text className="text-sm text-foreground">Space deleted · Undo</Text>
          </Pressable>
        )}
      </View>
      <Modal
        visible={editor !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !busy && setEditor(null)}
      >
        <SafeAreaView className="flex-1 bg-sheet">
          <View className="gap-4 p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-t3-semibold text-foreground">
                {editor?.id ? "Rename" : "New"} {editor?.kind}
              </Text>
              <Pressable
                disabled={busy}
                onPress={() => setEditor(null)}
                accessibilityRole="button"
                className="min-h-11 justify-center"
              >
                <Text className="text-foreground">Cancel</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Name"
              autoFocus
              value={editor?.name ?? ""}
              maxLength={PROFILE_NAME_MAX_LENGTH}
              onChangeText={(name) =>
                setEditor((current) => (current ? { ...current, name } : null))
              }
              placeholder="Name"
              className="min-h-12 rounded-xl bg-subtle px-3 text-base text-foreground"
              onSubmitEditing={() => void submit()}
            />
            <Text className="text-sm text-foreground-muted">{error}</Text>
            <Pressable
              disabled={busy || !state.writable}
              onPress={() => void submit()}
              accessibilityRole="button"
              className="min-h-12 items-center justify-center rounded-xl bg-foreground"
            >
              <Text className="font-t3-semibold text-screen">{busy ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
