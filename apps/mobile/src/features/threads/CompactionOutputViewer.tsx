import { useAtomValue } from "@effect/atom-react";
import { EventId, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Markdown } from "react-native-nitro-markdown";
import { AppText as Text } from "../../components/AppText";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { orchestrationEnvironment } from "../../state/orchestration";

function Summary(props: { environmentId: EnvironmentId; threadId: ThreadId; activityId: string }) {
  const theme = useUniwindTheme();
  const result = useAtomValue(
    orchestrationEnvironment.compactionOutput({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, activityId: EventId.make(props.activityId) },
    }),
  );
  const [query, setQuery] = useState("");
  if (result._tag !== "Success")
    return (
      <Text className="p-4 text-foreground-muted">
        {result._tag === "Failure"
          ? "Could not load summary. Reconnect and reopen this panel."
          : "Loading summary..."}
      </Text>
    );
  const output = result.value;
  const summary = output.summary;
  const pieces =
    query && summary
      ? summary.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"))
      : [];
  return (
    <>
      <Text className="px-4 pb-3 text-xs text-foreground-muted">
        {output.provider === "claudeAgent" ? "Claude" : output.provider} · {output.device}
        {"\n"}
        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(
          Date.parse(output.createdAt),
        )}
        {output.beforeTokens !== undefined && output.afterTokens !== undefined
          ? `\n${output.beforeTokens.toLocaleString()} → ${output.afterTokens.toLocaleString()} tokens`
          : ""}
      </Text>
      {summary === null ? (
        <Text className="p-4 text-foreground-muted">{output.reason}</Text>
      ) : (
        <>
          <View className="flex-row items-center gap-3 px-4 pb-3">
            <TextInput
              accessibilityLabel="Search compaction summary"
              placeholder="Find in summary"
              value={query}
              onChangeText={setQuery}
              className="flex-1 rounded-lg border border-adaptive-neutral-200-a80-white-a8 px-3 py-2 text-foreground"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void Clipboard.setStringAsync(summary).catch(() =>
                  Alert.alert("Could not copy summary"),
                )
              }
            >
              <Text className="text-foreground">Copy</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="p-4">
            {query ? (
              <>
                <Text className="mb-3 text-xs text-foreground-muted">
                  {Math.floor(pieces.length / 2)} matches
                </Text>
                <Text selectable className="text-sm leading-6 text-foreground">
                  {pieces.map((piece, index) =>
                    index % 2 ? (
                      <Text
                        key={index}
                        style={{
                          backgroundColor: theme["--color-user-bubble"],
                          color: theme["--color-user-bubble-foreground"],
                        }}
                      >
                        {piece}
                      </Text>
                    ) : (
                      piece
                    ),
                  )}
                </Text>
              </>
            ) : (
              <Markdown
                theme={{
                  colors: {
                    text: theme["--color-md-body"],
                    heading: theme["--color-md-strong"],
                    link: theme["--color-md-link"],
                    surface: "transparent",
                    surfaceLight: theme["--color-md-code-bg"],
                    border: theme["--color-md-hr"],
                  },
                }}
              >
                {summary}
              </Markdown>
            )}
          </ScrollView>
        </>
      )}
    </>
  );
}

export function CompactionOutputViewer(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  activityId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: view summary`}
        onPress={() => setOpen(true)}
        className="mb-3 items-center py-2"
      >
        <Text className="text-xs text-foreground-muted">{props.label} · View summary</Text>
      </Pressable>
      <Modal
        visible={open}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-screen pt-6">
          <View className="flex-row items-center justify-between p-4">
            <Text accessibilityRole="header" className="font-t3-medium text-base text-foreground">
              Compaction summary
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          <Text className="px-4 pb-3 text-xs text-foreground-muted">
            The provider's saved summary. Recent messages may also remain in context.
          </Text>
          {open && <Summary {...props} />}
        </View>
      </Modal>
    </>
  );
}
