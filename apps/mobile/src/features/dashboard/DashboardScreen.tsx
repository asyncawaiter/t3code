import { WorkItemsPanel } from "../tasks/WorkItemsPanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import {
  buildDashboard,
  dashboardHistory,
  DASHBOARD_REASON_LABELS,
  type DashboardLane,
  type DashboardHistoryView,
} from "@t3tools/client-runtime/state/dashboard";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { AppText as Text } from "../../components/AppText";
import { ControlPillMenu } from "../../components/ControlPill";
import { SymbolView } from "../../components/AppSymbol";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { useProfileThreads, useProfiles, profileSelectionAtom } from "../../state/profiles";
import { environmentServerConfigsAtom } from "../../state/server";
import { useWorkspaceState } from "../../state/workspace";
import { ProfilesPanel, chooseAction } from "../home/ProfilesPanel";
import { useHomeThreadSelection } from "../home/home-thread-navigation";
import { useThreadListActions, useArchivedThreadListActions } from "../home/useThreadListActions";
import { useThreadOrganization } from "../home/useThreadOrganization";
import { useArchivedThreadSnapshots } from "../archive/useArchivedThreadSnapshots";

const LANES: ReadonlyArray<{ id: DashboardLane; label: string }> = [
  { id: "needs-you", label: "Needs you" },
  { id: "running", label: "Running" },
  { id: "monitoring", label: "Monitoring" },
  { id: "done", label: "Ready to review" },
];

export function DashboardScreen() {
  const { projects, threads } = useProfileThreads();
  const { matchesThread } = useProfiles();
  const { environments } = useWorkspaceState();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const navigation = useNavigation();
  const open = useHomeThreadSelection();
  const [view, setView] = useState<"active" | DashboardHistoryView>("active");
  const [lane, setLane] = useState<DashboardLane | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selection = useAtomValue(profileSelectionAtom);
  useEffect(() => {
    setProject(null);
    setDevice(null);
    setProvider(null);
    setQuery("");
  }, [selection]);
  const [now, setNow] = useState(() => new Date().toISOString());
  useFocusEffect(
    useCallback(() => {
      const update = () => setNow(new Date().toISOString());
      update();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") update();
      }, 30_000);
      return () => clearInterval(timer);
    }, []),
  );
  const archivedIds = useMemo(
    () =>
      view === "archived"
        ? environments
            .filter((env) => env.connectionState === "connected")
            .map((env) => env.environmentId)
        : [],
    [view, environments],
  );
  const archived = useArchivedThreadSnapshots(archivedIds);
  const candidates =
    view === "archived"
      ? archived.snapshots
          .flatMap((snapshot) =>
            snapshot.snapshot.threads.map((thread) => ({
              ...thread,
              environmentId: snapshot.environmentId,
            })),
          )
          .filter(matchesThread)
      : threads;
  const filtered = candidates.filter(
    (thread) =>
      (!device || thread.environmentId === device) &&
      (!project || `${thread.environmentId}:${thread.projectId}` === project) &&
      (!provider ||
        configs
          .get(thread.environmentId)
          ?.providers.find((item) => item.instanceId === thread.modelSelection.instanceId)
          ?.driver === provider) &&
      thread.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const board = buildDashboard(filtered, now);
  const sections =
    view === "active"
      ? LANES.filter((item) => !lane || item.id === lane).map((item) => ({
          title: item.label,
          data: board.lanes[item.id].map((entry) => ({
            thread: entry.shell,
            reason: DASHBOARD_REASON_LABELS[entry.reason],
          })),
        }))
      : [
          {
            title: view[0]!.toUpperCase() + view.slice(1),
            data: dashboardHistory(filtered, now, view).map((thread) => ({ thread, reason: view })),
          },
        ];
  const chooseDevice = () =>
    chooseAction("Device", [
      { title: "All devices", action: () => setDevice(null) },
      ...environments.map((env) => ({
        title: env.environmentLabel,
        action: () => {
          setDevice(env.environmentId);
          setProject(null);
        },
      })),
    ]);
  const chooseProject = () =>
    chooseAction("Project", [
      { title: "All projects", action: () => setProject(null) },
      ...projects
        .filter((item) => !device || item.environmentId === device)
        .map((item) => ({
          title: `${item.title} · ${environments.find((env) => env.environmentId === item.environmentId)?.environmentLabel ?? "Device"}`,
          action: () => setProject(`${item.environmentId}:${item.id}`),
        })),
    ]);
  const providers = [
    ...new Set(
      [...configs.values()].flatMap((config) => config.providers.map((item) => item.driver)),
    ),
  ];
  const header = (
    <View className="gap-2 pb-3">
      <ProfilesPanel />
      <View className="flex-row gap-2 px-3">
        <TextInput
          accessibilityLabel="Search tasks"
          placeholder="Search tasks"
          value={query}
          onChangeText={setQuery}
          className="min-h-11 flex-1 rounded-xl bg-subtle px-3 text-base text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pull requests"
          onPress={() => navigation.navigate("PullRequests")}
          className="size-11 items-center justify-center rounded-xl bg-subtle"
        >
          <SymbolView name="arrow.triangle.pull" size={18} tintColorClassName="accent-icon-muted" />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {[
          {
            label:
              environments.find((env) => env.environmentId === device)?.environmentLabel ??
              "All devices",
            action: chooseDevice,
          },
          {
            label:
              projects.find((item) => `${item.environmentId}:${item.id}` === project)?.title ??
              "All projects",
            action: chooseProject,
          },
          {
            label: provider ?? "All providers",
            action: () =>
              chooseAction("Provider", [
                { title: "All providers", action: () => setProvider(null) },
                ...providers.map((driver) => ({
                  title: driver,
                  action: () => setProvider(driver),
                })),
              ]),
          },
          {
            label: view,
            action: () =>
              chooseAction(
                "View",
                (["active", "snoozed", "settled", "archived"] as const).map((id) => ({
                  title: id,
                  action: () => setView(id),
                })),
              ),
          },
        ].map((item, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            onPress={item.action}
            className="min-h-11 justify-center rounded-xl bg-subtle px-3"
          >
            <Text className="text-sm text-foreground">{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {view === "active" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {LANES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: lane === item.id }}
              onPress={() => setLane(lane === item.id ? null : item.id)}
              className={cn(
                "min-h-11 justify-center rounded-full px-3",
                lane === item.id ? "bg-foreground" : "bg-subtle",
              )}
            >
              <Text className={lane === item.id ? "text-screen" : "text-foreground"}>
                {item.label} {board.counts[item.id]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {view === "active" && (
        <WorkItemsPanel search={query} deviceFilter={device} projectFilter={project} />
      )}
      {archived.error && <Text className="px-3 text-sm text-foreground">{archived.error}</Text>}
    </View>
  );
  return (
    <SectionList
      className="flex-1 bg-screen"
      sections={sections}
      keyExtractor={(entry) => `${entry.thread.environmentId}:${entry.thread.id}`}
      ListHeaderComponent={header}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      renderSectionHeader={({ section }) => (
        <View className="px-4 pb-2 pt-3">
          <Text className="font-t3-semibold text-foreground">
            {section.title} · {section.data.length}
          </Text>
          {section.data.length === 0 && (
            <Text className="py-4 text-sm text-foreground-muted">No tasks in this view.</Text>
          )}
        </View>
      )}
      renderItem={({ item }) => (
        <DashboardRow
          thread={item.thread}
          reason={item.reason}
          projectName={
            projects.find(
              (project) =>
                project.id === item.thread.projectId &&
                project.environmentId === item.thread.environmentId,
            )?.title ?? "Project"
          }
          deviceName={
            environments.find((env) => env.environmentId === item.thread.environmentId)
              ?.environmentLabel ?? "Device"
          }
          onOpen={() => open(item.thread)}
        />
      )}
    />
  );
}

function DashboardRow(props: {
  thread: EnvironmentThreadShell;
  reason: string;
  projectName: string;
  deviceName: string;
  onOpen: () => void;
}) {
  const organization = useThreadOrganization(props.thread);
  const actions = useThreadListActions();
  const archived = useArchivedThreadListActions(() => {});
  return (
    <View className="mx-3 mb-2 flex-row items-center rounded-2xl bg-subtle p-3">
      <Pressable accessibilityRole="button" onPress={props.onOpen} className="flex-1 gap-1">
        <Text numberOfLines={2} className="font-t3-medium text-foreground">
          {props.thread.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-foreground-muted">
          {props.projectName} · {props.deviceName}
        </Text>
        <Text className="text-xs text-foreground-muted">
          {props.reason} · {relativeTime(props.thread.updatedAt)}
        </Text>
      </Pressable>
      <ControlPillMenu
        actions={[
          ...organization.actions,
          ...(props.thread.archivedAt
            ? [{ id: "restore", title: "Restore chat" }]
            : [
                {
                  id: "settle",
                  title: props.thread.settledOverride === "settled" ? "Unsettle" : "Settle",
                },
                { id: "snooze", title: props.thread.snoozedUntil ? "Wake chat" : "Snooze" },
                { id: "archive", title: "Archive" },
              ]),
        ]}
        onPressAction={({ nativeEvent }) => {
          const id = nativeEvent.event;
          if (organization.handle(id)) return;
          if (id === "restore") archived.unarchiveThread(props.thread);
          if (id === "archive") actions.archiveThread(props.thread);
          if (id === "settle")
            (props.thread.settledOverride === "settled"
              ? actions.unsettleThread
              : actions.settleThread)(props.thread);
          if (id === "snooze") {
            if (props.thread.snoozedUntil) actions.unsnoozeThread(props.thread);
            else
              chooseAction("Snooze", [
                {
                  title: "One hour",
                  action: () =>
                    actions.snoozeThread(
                      props.thread,
                      new Date(Date.now() + 3_600_000).toISOString(),
                    ),
                },
              ]);
          }
        }}
      >
        <View accessibilityLabel="Chat actions" className="size-11 items-center justify-center">
          <SymbolView name="ellipsis" size={18} tintColorClassName="accent-icon-muted" />
        </View>
      </ControlPillMenu>
    </View>
  );
}
