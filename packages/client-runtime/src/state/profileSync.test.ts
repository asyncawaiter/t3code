import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type Profile } from "@t3tools/contracts";
import {
  inheritForkPlacement,
  resolveProfileSource,
  profileThreadFilter,
  profileSpaceCounts,
  OUTSIDE_SPACES,
  moveProjectToProfile,
  saveSharedProfiles,
} from "./profileSync";

const godel = Schema.decodeUnknownSync(EnvironmentId)("godel");
const poly = Schema.decodeUnknownSync(EnvironmentId)("poly");
const profile: Profile = { id: "work", name: "Work", color: "gray", projectKeys: [] };
const config = (
  profiles: ReadonlyArray<Profile>,
  profileSyncSourceId: EnvironmentId | null = null,
) => ({ settings: { profiles, profileSyncSourceId } });

describe("profile source discovery", () => {
  it("shows Godel's existing profiles on an empty Poly installation", () => {
    const configs = new Map([
      [godel, config([profile])],
      [poly, config([])],
    ]);
    expect(resolveProfileSource(configs, poly)).toEqual({ sourceId: godel, conflict: false });
    expect(resolveProfileSource(configs, godel)).toEqual({ sourceId: godel, conflict: false });
  });
  it("retains the selected source when offline or when its last profile is deleted", () => {
    expect(resolveProfileSource(new Map([[poly, config([], godel)]]), poly)).toEqual({
      sourceId: godel,
      conflict: false,
    });
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([], godel)],
          [poly, config([profile], godel)],
        ]),
        poly,
      ),
    ).toEqual({ sourceId: godel, conflict: false });
  });
  it("requires a choice for divergent collections and source pointers", () => {
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([profile])],
          [poly, config([{ ...profile, name: "Other" }])],
        ]),
        poly,
      ).conflict,
    ).toBe(true);
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([], godel)],
          [poly, config([], poly)],
        ]),
        poly,
      ).conflict,
    ).toBe(true);
  });
  it("chooses the same source for identical legacy copies regardless of connection order", () => {
    expect(
      resolveProfileSource(
        new Map([
          [poly, config([profile])],
          [godel, config([profile])],
        ]),
        poly,
      ).sourceId,
    ).toBe(godel);
  });
});

const organized: Profile = {
  ...profile,
  projectKeys: ["godel:project"],
  spaces: [
    {
      id: "build",
      name: "Build",
      threads: [{ threadKey: "godel:assigned", projectKey: "godel:project" }],
    },
    { id: "ideas", name: "Ideas", threads: [] },
  ],
  threadPins: [{ threadKey: "godel:root-pin", projectKey: "godel:project", spaceId: null }],
};
const thread = (id: string, pinnedAt?: string) => ({
  id,
  environmentId: "godel",
  projectId: "project",
  pinnedAt,
});

it("filters outside spaces without hiding profile and global pins", () => {
  const outside = profileThreadFilter([organized], "work", OUTSIDE_SPACES);
  expect(outside(thread("assigned"))).toBe(false);
  expect(outside(thread("loose"))).toBe(true);
  const space = profileThreadFilter([organized], "work", "build");
  expect(space(thread("assigned"))).toBe(true);
  expect(space(thread("loose"))).toBe(false);
  expect(space(thread("root-pin", "2026-09-01"))).toBe(true);
  expect(space({ ...thread("global", "2026-09-01"), projectId: "elsewhere" })).toBe(true);
  expect(space({ ...thread("assigned"), environmentId: "poly" })).toBe(false);
  expect(profileThreadFilter([organized], null, null)(thread("assigned"))).toBe(true);
});

it("shows only unassigned chats in Default when viewing All profiles", () => {
  const outside = profileThreadFilter([organized], null, OUTSIDE_SPACES);
  expect(outside(thread("assigned"))).toBe(false);
  expect(outside(thread("loose"))).toBe(true);
  expect(outside({ ...thread("assigned"), environmentId: "poly" })).toBe(true);
});

it("counts Default without mixing assigned, archived or other-profile chats", () => {
  const chats = [
    thread("assigned"),
    thread("loose"),
    { ...thread("old"), archivedAt: "2026-09-01" },
    { ...thread("assigned"), environmentId: "poly" },
  ];
  expect(profileSpaceCounts([organized], "work", chats)).toEqual(
    new Map([
      ["build", 1],
      [OUTSIDE_SPACES, 1],
    ]),
  );
  expect(profileSpaceCounts([organized], null, chats).get(OUTSIDE_SPACES)).toBe(2);
});

it("excludes settled chats from Space and Unsorted counts and counts them again when reopened", () => {
  const settled = [
    { ...thread("assigned", "2026-09-01"), settledOverride: "settled" as const },
    { ...thread("loose"), settledOverride: "settled" as const },
  ];
  const active = thread("active");
  expect(profileSpaceCounts([organized], "work", [...settled, active])).toEqual(
    new Map([[OUTSIDE_SPACES, 1]]),
  );
  expect(profileSpaceCounts([organized], "work", settled).size).toBe(0);
  expect(
    profileSpaceCounts([organized], "work", [
      ...settled.map((chat) => ({ ...chat, settledOverride: "active" as const })),
      active,
    ]),
  ).toEqual(
    new Map([
      ["build", 1],
      [OUTSIDE_SPACES, 2],
    ]),
  );
});

it("moves a whole project, removing old spaces and scoped pins but retaining its new siblings", () => {
  const target = {
    ...profile,
    id: "personal",
    projectKeys: ["poly:other"],
    spaces: [{ id: "other", name: "Other", threads: [] }],
  };
  const moved = moveProjectToProfile([organized, target], "godel:project", "personal");
  expect(moved[0]?.projectKeys).toEqual([]);
  expect(moved[0]?.spaces?.[0]?.threads).toEqual([]);
  expect(moved[0]?.threadPins).toEqual([]);
  expect(moved[1]?.projectKeys).toEqual(["poly:other", "godel:project"]);
  expect(() => moveProjectToProfile(moved, "godel:project", "deleted")).toThrow("removed");
});

it("serializes edits against fresh source settings and recovers after a failed write", async () => {
  let profiles: ReadonlyArray<Profile> = [];
  const bases: ReadonlyArray<Profile>[] = [];
  const io = {
    getSource: () => ({
      sourceId: godel,
      conflict: false,
      config: { environment: { capabilities: { profileSynchronization: true } } },
    }),
    read: async () => ({ profiles, profileSyncSourceId: godel }),
    save: async (
      _id: EnvironmentId,
      next: ReadonlyArray<Profile>,
      base: ReadonlyArray<Profile>,
    ) => {
      bases.push(base);
      profiles = next;
    },
  };
  const first = saveSharedProfiles((current) => [...current, profile], io);
  const second = saveSharedProfiles((current) => [...current, { ...profile, id: "personal" }], io);
  await Promise.all([first, second]);
  expect(bases.map((base) => base.length)).toEqual([0, 1]);
  await expect(
    saveSharedProfiles(() => {
      throw new Error("failed");
    }, io),
  ).rejects.toThrow("failed");
  await saveSharedProfiles((current) => current, io);
  expect(profiles).toHaveLength(2);
  await expect(
    saveSharedProfiles((current) => current, {
      ...io,
      read: async () => ({ profiles, profileSyncSourceId: poly }),
    }),
  ).rejects.toThrow("source changed");
  await expect(
    saveSharedProfiles((current) => current, {
      ...io,
      getSource: () => ({ ...io.getSource(), conflict: true }),
    }),
  ).rejects.toThrow("Choose a shared");
});

it("counts and pages the selected Space before taking a shelf window", () => {
  const siblings = Array.from({ length: 20 }, (_, index) => thread(`sibling-${index}`));
  const shelf = [...siblings, thread("assigned")];
  const visible = shelf.filter(profileThreadFilter([organized], "work", "build"));
  expect(visible).toHaveLength(1);
  expect(visible.slice(0, 10).map((entry) => entry.id)).toEqual(["assigned"]);
  expect(shelf.filter(profileThreadFilter([organized], "work", OUTSIDE_SPACES))).toEqual(siblings);
});

describe("fork placement", () => {
  const parent: Profile = {
    ...profile,
    projectKeys: ["godel:project"],
    spaces: [
      {
        id: "pod",
        name: "POD",
        threads: [{ threadKey: "godel:source", projectKey: "godel:project" }],
      },
      { id: "other", name: "Other", threads: [] },
    ],
  };
  const input = {
    environmentId: "godel",
    projectId: "project",
    sourceThreadId: "source",
    threadId: "fork",
  };
  it("keeps the fork in its source profile and Space without changing the source", () => {
    const unrelated = { ...profile, id: "personal", projectKeys: ["poly:project"] };
    const result = inheritForkPlacement([parent, unrelated], input);
    const child = { environmentId: "godel", id: "fork", projectId: "project" };
    expect(profileThreadFilter(result, "work", "pod")(child)).toBe(true);
    expect(profileThreadFilter(result, "work", OUTSIDE_SPACES)(child)).toBe(false);
    expect(result[0]?.spaces?.[0]?.threads).toEqual([
      ...parent.spaces![0]!.threads,
      { threadKey: "godel:fork", projectKey: "godel:project" },
    ]);
    expect(result[1]).toBe(unrelated);
    expect(parent.spaces?.[0]?.threads).toHaveLength(1);
    expect(inheritForkPlacement(result, input)[0]?.spaces?.[0]?.threads).toHaveLength(2);
  });
  it("keeps Default forks in Default and does not match another device's identical IDs", () => {
    const profiles = [parent];
    expect(inheritForkPlacement(profiles, { ...input, sourceThreadId: "default-chat" })).toBe(
      profiles,
    );
    expect(inheritForkPlacement(profiles, { ...input, environmentId: "poly" })).toBe(profiles);
  });
  it("uses the source's latest Space if it moves while the fork is being created", () => {
    const moved: Profile = {
      ...parent,
      spaces: [
        { id: "pod", name: "POD", threads: [] },
        { id: "other", name: "Other", threads: parent.spaces![0]!.threads },
      ],
    };
    const result = inheritForkPlacement([moved], input);
    expect(
      profileThreadFilter(
        result,
        "work",
        "other",
      )({ environmentId: "godel", id: "fork", projectId: "project" }),
    ).toBe(true);
  });
});
