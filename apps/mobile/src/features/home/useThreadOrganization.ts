import { moveProjectToProfile } from "@t3tools/client-runtime/state/profiles";
import { useAtomValue } from "@effect/atom-react";
import { environmentServerConfigsAtom } from "../../state/server";
import type { MenuAction } from "@react-native-menu/menu";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { profileForProject, spaceForThread, moveThreadsToSpace } from "@t3tools/contracts";
import { Alert } from "react-native";
import { useProfiles, useSaveProfiles } from "../../state/profiles";
import { useThreadListActions } from "./useThreadListActions";

export function useThreadOrganization(thread: EnvironmentThreadShell) {
  const source = useProfiles();
  const save = useSaveProfiles();
  const { pinThread, unpinThread } = useThreadListActions();
  const threadKey = `${thread.environmentId}:${thread.id}`;
  const projectKey = `${thread.environmentId}:${thread.projectId}`;
  const owner = profileForProject(source.profiles, projectKey);
  const space = owner && spaceForThread(owner, threadKey, projectKey);
  const configs = useAtomValue(environmentServerConfigsAtom);
  const pinningSupported =
    configs.get(thread.environmentId)?.environment.capabilities.threadPinning === true;
  const pin = owner?.threadPins?.find((item) => item.threadKey === threadKey);
  const pinnedScope = !thread.pinnedAt ? null : !pin ? "global" : pin.spaceId ? "space" : "profile";
  const checked = (scope: string) => (pinnedScope === scope ? ("on" as const) : ("off" as const));
  const actions: MenuAction[] = [
    {
      id: "organization-pin",
      title: "Pin",
      image: "pin",
      subactions: [
        {
          id: "organization-pin:global",
          title: "Global",
          state: checked("global"),
          attributes: { disabled: !!pin && !source.writable },
        },
        ...(owner
          ? [
              {
                id: "organization-pin:profile",
                title: owner.name,
                state: checked("profile"),
                attributes: { disabled: !source.writable },
              },
              ...(space
                ? [
                    {
                      id: "organization-pin:space",
                      title: `${owner.name} / ${space.name}`,
                      state: checked("space"),
                      attributes: { disabled: !source.writable },
                    },
                  ]
                : []),
            ]
          : []),
        ...(thread.pinnedAt
          ? [{ id: "organization-unpin", title: "Unpin", image: "pin.slash" }]
          : []),
      ],
    },
    ...(owner
      ? [
          {
            id: "organization-space",
            title: "Move to space",
            image: "tag",
            attributes: { disabled: !source.writable },
            subactions: [
              { id: "organization-space:", title: "Outside spaces" },
              ...(owner.spaces ?? []).map((item) => ({
                id: `organization-space:${item.id}`,
                title: item.name,
                state: item.id === space?.id ? ("on" as const) : ("off" as const),
              })),
            ],
          },
        ]
      : []),
    {
      id: "organization-profile",
      title: "Move project to profile",
      attributes: { disabled: !source.writable },
      subactions: [
        { id: "organization-profile:", title: "Unassigned (All)" },
        ...source.profiles.map((profile) => ({
          id: `organization-profile:${profile.id}`,
          title: profile.name,
        })),
      ],
    },
  ];
  const apply = async (id: string) => {
    if (id === "organization-unpin") {
      await unpinThread(thread);
      return;
    }
    if (id.startsWith("organization-pin:")) {
      const scope = id.slice("organization-pin:".length);
      // A global pin without existing organization also works before profiles are configured.
      if (
        scope !== "global" ||
        source.profiles.some((profile) =>
          profile.threadPins?.some((pin) => pin.threadKey === threadKey),
        )
      ) {
        await save((profiles) => {
          const parent = profileForProject(profiles, projectKey);
          const assigned = parent && spaceForThread(parent, threadKey, projectKey);
          if (scope !== "global" && !parent)
            throw new Error("This project is no longer in a profile.");
          if (scope === "space" && !assigned) throw new Error("This chat is no longer in a space.");
          return profiles.map((profile) => ({
            ...profile,
            threadPins: [
              ...(profile.threadPins ?? []).filter((pin) => pin.threadKey !== threadKey),
              ...(profile.id === parent?.id && scope !== "global"
                ? [{ threadKey, projectKey, spaceId: scope === "space" ? assigned!.id : null }]
                : []),
            ],
          }));
        });
      }
      if (!thread.pinnedAt) await pinThread(thread);
    } else if (id.startsWith("organization-space:")) {
      const spaceId = id.slice("organization-space:".length) || null;
      await save((profiles) => {
        const parent = profileForProject(profiles, projectKey);
        if (
          !parent ||
          parent.id !== owner?.id ||
          (spaceId && !parent.spaces?.some((space) => space.id === spaceId))
        )
          throw new Error("The chat's placement changed. Review it and retry.");
        return profiles.map((profile) =>
          profile.id === parent.id
            ? moveThreadsToSpace(profile, [{ threadKey, projectKey }], spaceId)
            : profile,
        );
      });
    } else if (id.startsWith("organization-profile:")) {
      const profileId = id.slice("organization-profile:".length);
      await save((profiles) => moveProjectToProfile(profiles, projectKey, profileId || null));
    }
  };
  const handle = (id: string) => {
    if (!id.startsWith("organization-")) return false;
    const run = () => {
      void apply(id).catch((error: unknown) =>
        Alert.alert(
          "Could not organize chat",
          error instanceof Error ? error.message : "Please retry.",
        ),
      );
    };
    if (id.startsWith("organization-profile:"))
      Alert.alert(
        "Move project?",
        "This changes the profile of every chat in this project. Existing space assignments are cleared.",
        [{ text: "Cancel" }, { text: "Move", onPress: run }],
      );
    else run();
    return true;
  };
  return {
    actions: actions.filter((item) => pinningSupported || item.id !== "organization-pin"),
    handle,
  };
}
