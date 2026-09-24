import * as Schema from "effect/Schema";
import { useAtomValue } from "@effect/atom-react";
import { indexProfileSpaces, profileForProject, type ProjectId } from "@t3tools/contracts";
import { profileThreadFilter } from "@t3tools/client-runtime/state/profiles";
import { profileSourceAtom } from "../state/server";
import { readThreadShell } from "../state/entities";
import { usePrimarySettings } from "./useSettings";
import { useChatBoards } from "./useChatBoards";
import { useLocalStorage } from "./useLocalStorage";
import { OUTSIDE_SPACES } from "../components/sidebar/Spaces.logic";
import { spaceColumnsNavigation } from "../components/spaces/columnNavigation";

const ColumnLocation = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("board"),
    boardId: Schema.String,
    boardName: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("space"),
    profileId: Schema.String,
    spaceId: Schema.optional(Schema.String),
    unsorted: Schema.Boolean,
  }),
]);
export type ColumnLocation = typeof ColumnLocation.Type;
const Locations = Schema.Record(Schema.String, ColumnLocation);
const EMPTY: typeof Locations.Type = {};
export function sameColumnLocation(a: ColumnLocation | undefined, b: ColumnLocation | undefined) {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === "board" && b.kind === "board"
    ? a.boardId === b.boardId
    : a.kind === "space" &&
        b.kind === "space" &&
        a.profileId === b.profileId &&
        a.spaceId === b.spaceId &&
        a.unsorted === b.unsorted;
}

export function rememberColumnLocation(
  current: typeof Locations.Type,
  key: string,
  location: ColumnLocation,
  previousKey?: string,
) {
  const next = { ...current, [key]: location };
  if (previousKey && previousKey !== key) delete next[previousKey];
  return next;
}

export function useChatColumnMemory() {
  const source = useAtomValue(profileSourceAtom);
  const [locations, setLocations] = useLocalStorage(
    `t3.columns-last-used.${source.sourceId}`,
    EMPTY,
    Locations,
  );
  return {
    locations,
    remember: (key: string, location: ColumnLocation, previousKey?: string) => {
      if (previousKey || JSON.stringify(locations[key]) !== JSON.stringify(location))
        setLocations((current) => rememberColumnLocation(current, key, location, previousKey));
    },
  };
}

export function useChatColumnLocation() {
  const { locations } = useChatColumnMemory();
  const { boards, unavailable } = useChatBoards();
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const placements = indexProfileSpaces(profiles);
  return (
    chat: Parameters<typeof readThreadShell>[0] & { projectId?: ProjectId | undefined },
    override?: ColumnLocation,
  ) => {
    const key = `${chat.environmentId}:${chat.threadId}`;
    const remembered = override ?? locations[key];
    const shell = readThreadShell(chat);
    const projectId = chat.projectId ?? shell?.projectId;
    const placement = placements.get(key);
    const owner =
      placement?.profile ??
      (projectId ? profileForProject(profiles, `${chat.environmentId}:${projectId}`) : undefined);
    const ownSpace: ColumnLocation = {
      kind: "space",
      profileId: owner?.id ?? "all",
      spaceId: placement?.space.id,
      unsorted: !!owner && !placement,
    };
    const spaceChoice = (location: Extract<ColumnLocation, { kind: "space" }>) => {
      const profile = profiles.find((item) => item.id === location.profileId);
      const space = profile?.spaces?.find((item) => item.id === location.spaceId);
      return {
        location,
        label: space
          ? `Space · ${space.name}`
          : location.unsorted
            ? `Unsorted · ${profile?.name ?? "All"}`
            : profile
              ? `Spaces · ${profile.name}`
              : "All chats",
        navigation: spaceColumnsNavigation(location, key),
      };
    };
    const boardChoice = (id: string, name: string) => ({
      location: { kind: "board" as const, boardId: id, boardName: name },
      label: `Board · ${name}`,
      navigation: {
        to: "/spaces/$profileId" as const,
        params: { profileId: "all" },
        search: {
          view: "columns" as const,
          workspace: "board" as const,
          board: id,
          space: undefined,
          unsorted: false,
          focus: key,
        },
      },
    });
    const choices = [
      spaceChoice(ownSpace),
      ...boards
        .filter((board) => board.order.includes(key) && !board.hidden.includes(key))
        .map((board) => boardChoice(board.id, board.name)),
    ];
    if (ownSpace.profileId !== "all")
      choices.push(spaceChoice({ kind: "space", profileId: "all", unsorted: false }));
    let destination = choices.find((choice) => sameColumnLocation(choice.location, remembered));
    if (
      !destination &&
      remembered?.kind === "space" &&
      projectId &&
      (remembered.profileId === "all" ||
        profiles.some(
          (profile) =>
            profile.id === remembered.profileId &&
            (!remembered.spaceId ||
              profile.spaces?.some((space) => space.id === remembered.spaceId)),
        )) &&
      profileThreadFilter(
        profiles,
        remembered.profileId,
        remembered.unsorted ? OUTSIDE_SPACES : (remembered.spaceId ?? null),
      )({ environmentId: chat.environmentId, id: chat.threadId, projectId, pinnedAt: null })
    ) {
      destination = spaceChoice(remembered);
      choices.push(destination);
    }
    const blocked = !destination && remembered?.kind === "board" && !!unavailable;
    if (blocked && remembered?.kind === "board")
      destination = boardChoice(remembered.boardId, remembered.boardName ?? "Saved board");
    const fallback =
      !destination && remembered
        ? remembered.kind === "board"
          ? boards.some((board) => board.id === remembered.boardId)
            ? `This chat is no longer on ${boards.find((board) => board.id === remembered.boardId)!.name}.`
            : `${remembered.boardName ?? "The previous board"} is no longer available.`
          : "This chat is no longer in its previous Space."
        : undefined;
    destination ??= choices[0]!;
    const lastUsed = sameColumnLocation(destination.location, locations[key]);
    return {
      ...destination,
      choices: choices.map((choice) => ({
        ...choice,
        lastUsed: sameColumnLocation(choice.location, locations[key]),
      })),
      fallback,
      blocked: blocked
        ? "Reconnect the shared profile device to locate this board. Your saved destination is unchanged."
        : undefined,
      tooltip: lastUsed
        ? "Last used here. Click to return."
        : destination.location.kind === "board"
          ? "Open in this board."
          : destination.label === "All chats"
            ? "Opens in All chats."
            : "Opens in this Space.",
    };
  };
}
export type ChatColumnDestination = ReturnType<ReturnType<typeof useChatColumnLocation>>;
