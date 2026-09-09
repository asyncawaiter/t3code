import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Alert, FlatList, Pressable, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  WS_METHODS,
  type PullRequestListEntry,
  type PullRequestListState,
  type PullRequestInvolvement,
} from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../../connection/runtime";
import { environmentServerConfigsAtom } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useWorkspaceState } from "../../state/workspace";
import { useProfiles } from "../../state/profiles";
import { useProjects, useThreadShells } from "../../state/entities";
import { useDebouncedValue } from "../../state/queries";
import { AppText as Text } from "../../components/AppText";
import { chooseAction } from "../home/ProfilesPanel";

const listPullRequests = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "mobile:pull-requests:list",
  tag: WS_METHODS.pullRequestsList,
  staleTimeMs: 30_000,
});

export function PullRequestsScreen() {
  const { environments } = useWorkspaceState();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const projects = useProjects();
  const threads = useThreadShells();
  const { profile } = useProfiles();
  const navigation = useNavigation();
  const devices = environments.filter(
    (env) => configs.get(env.environmentId)?.environment.capabilities.pullRequests,
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const device = devices.find((env) => env.environmentId === deviceId) ?? devices[0];
  const [state, setState] = useState<PullRequestListState>("open");
  const [involvement, setInvolvement] = useState<PullRequestInvolvement>("all");
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 250);
  const [limit, setLimit] = useState(30);
  const [projectId, setProjectId] = useState<string | null>(null);
  const scopedProjects = useMemo(
    () =>
      projects.filter(
        (item) =>
          item.environmentId === device?.environmentId &&
          (profile.id === "all" ||
            profile.projectKeys.includes(`${item.environmentId}:${item.id}`)),
      ),
    [projects, device?.environmentId, profile],
  );
  const project = scopedProjects.find((item) => item.id === projectId);
  const target = useMemo(
    () =>
      device && scopedProjects.length > 0
        ? listPullRequests({
            environmentId: device.environmentId,
            input: {
              state,
              involvement,
              limit,
              ...(project
                ? { projectId: project.id }
                : profile.id !== "all"
                  ? { projectIds: scopedProjects.slice(0, 100).map((item) => item.id) }
                  : {}),
              ...(search ? { query: search } : {}),
            },
          })
        : null,
    [device, scopedProjects, state, involvement, limit, project, profile.id, search],
  );
  const result = useEnvironmentQuery(target);
  useEffect(
    () => setLimit(30),
    [device?.environmentId, state, involvement, project?.id, search, profile.id],
  );
  const open = (entry: PullRequestListEntry) => {
    const linked = threads.filter(
      (thread) =>
        thread.environmentId === device?.environmentId &&
        thread.projectId === entry.projectId &&
        thread.branch === entry.headBranch,
    );
    chooseAction(`${entry.repository} #${entry.number}`, [
      {
        title: "Open pull request",
        action: () => {
          if (!/^https?:\/\//i.test(entry.url)) return;
          void WebBrowser.openBrowserAsync(entry.url).catch(() =>
            Alert.alert("Could not open pull request", "Please retry."),
          );
        },
      },
      ...linked.map((thread) => ({
        title: `Chat: ${thread.title}`,
        action: () =>
          navigation.navigate("Thread", {
            environmentId: thread.environmentId,
            threadId: thread.id,
          }),
      })),
      {
        title: "New chat in project",
        action: () => {
          if (device)
            navigation.navigate("NewTaskSheet", {
              screen: "NewTaskDraft",
              params: {
                environmentId: device.environmentId,
                projectId: entry.projectId,
                title: entry.projectTitle,
              },
            });
        },
      },
    ]);
  };
  return (
    <FlatList
      className="flex-1 bg-screen"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={result.data?.entries ?? []}
      keyExtractor={(item) => `${item.host}:${item.repository}:${item.number}`}
      refreshing={result.isPending}
      onRefresh={result.refresh}
      ListHeaderComponent={
        <View className="gap-2 p-3">
          <Text className="text-sm text-foreground-muted">
            {profile.id === "all" ? "All profiles" : profile.name} · Pull requests on this device
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              chooseAction(
                "Device",
                devices.map((env) => ({
                  title: env.environmentLabel,
                  action: () => {
                    setDeviceId(env.environmentId);
                    setProjectId(null);
                  },
                })),
              )
            }
            className="min-h-11 justify-center rounded-xl bg-subtle px-3"
          >
            <Text className="text-foreground">
              {device?.environmentLabel ?? "No supported device connected"}
              {device && device.connectionState !== "connected" ? " (offline)" : ""}
            </Text>
          </Pressable>
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                chooseAction(
                  "State",
                  (["open", "merged", "closed", "all"] as const).map((id) => ({
                    title: id,
                    action: () => setState(id),
                  })),
                )
              }
              className="min-h-11 flex-1 justify-center rounded-xl bg-subtle px-3"
            >
              <Text className="text-foreground">{state}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                chooseAction(
                  "Involvement",
                  (["all", "reviewing", "authored"] as const).map((id) => ({
                    title: id,
                    action: () => setInvolvement(id),
                  })),
                )
              }
              className="min-h-11 flex-1 justify-center rounded-xl bg-subtle px-3"
            >
              <Text className="text-foreground">{involvement}</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              chooseAction("Project", [
                { title: "All projects", action: () => setProjectId(null) },
                ...scopedProjects.map((item) => ({
                  title: item.title,
                  action: () => setProjectId(item.id),
                })),
              ])
            }
            className="min-h-11 justify-center rounded-xl bg-subtle px-3"
          >
            <Text className="text-foreground">{project?.title ?? "All projects"}</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Search pull requests"
            placeholder="Search pull requests"
            value={query}
            maxLength={200}
            onChangeText={setQuery}
            className="min-h-11 rounded-xl bg-subtle px-3 text-base text-foreground"
          />
          {result.error && <Text className="text-sm text-foreground">{result.error}</Text>}
          {scopedProjects.length > 100 && profile.id !== "all" && !project && (
            <Text className="text-sm text-foreground-muted">
              Showing the first 100 projects. Choose a project to search another.
            </Text>
          )}
          {result.data?.errors.map((error) => (
            <Text key={error.projectId} className="text-xs text-foreground-muted">
              {error.projectTitle}: {error.message}
            </Text>
          ))}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(item)}
          className="mx-3 mb-2 gap-1 rounded-2xl bg-subtle p-3"
        >
          <Text numberOfLines={2} className="font-t3-medium text-foreground">
            {item.title}
          </Text>
          <Text className="text-xs text-foreground-muted">
            {item.repository} #{item.number} · {item.author?.login ?? "Unknown author"}
          </Text>
          <Text className="text-xs text-foreground-muted">
            {item.state}
            {item.isDraft ? " · Draft" : ""}
            {item.checksState ? ` · Checks: ${item.checksState}` : ""}
            {item.reviewDecision ? ` · ${item.reviewDecision}` : ""}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        result.isPending ? (
          <ActivityIndicator />
        ) : (
          <Text className="p-5 text-sm text-foreground-muted">
            {result.error ? "Pull to retry." : "No pull requests in this view."}
          </Text>
        )
      }
      ListFooterComponent={
        result.data?.truncated ? (
          <Pressable
            accessibilityRole="button"
            disabled={result.isPending || limit >= 500}
            onPress={() => setLimit(Math.min(limit + 50, 500))}
            className="min-h-12 items-center justify-center"
          >
            <Text className="text-foreground">
              {limit >= 500 ? "Narrow the search to see more results" : "Load more"}
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}
