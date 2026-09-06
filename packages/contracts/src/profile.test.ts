import { describe, expect, it } from "@effect/vitest";

import * as Schema from "effect/Schema";

import {
  indexProfilePins,
  mergeProfileEdits,
  moveThreadsToSpace,
  ALL_PROFILE,
  ALL_PROFILE_ID,
  Profile,
  findProfile,
  isProjectInProfile,
  nextProfileId,
  resolveProfiles,
  type Profile as ProfileType,
} from "./profile.ts";

const work: ProfileType = {
  id: "work",
  name: "Work",
  color: "blue",
  projectKeys: ["env-1:proj-1"],
};
const home: ProfileType = {
  id: "home",
  name: "Home",
  color: "green",
  projectKeys: ["env-1:proj-2"],
};

describe("resolveProfiles", () => {
  it("pins All first, ahead of the user's own profiles", () => {
    const resolved = resolveProfiles([work, home]);
    expect(resolved.map((profile) => profile.id)).toEqual([ALL_PROFILE_ID, "work", "home"]);
  });

  it("drops entries that collide with the all id or repeat an earlier id", () => {
    const resolved = resolveProfiles([
      { ...work, id: ALL_PROFILE_ID },
      work,
      { ...home, id: work.id },
    ]);
    expect(resolved).toEqual([ALL_PROFILE, work]);
  });
});

describe("isProjectInProfile", () => {
  it("matches every project for the All profile", () => {
    expect(isProjectInProfile(ALL_PROFILE, "anything:goes")).toBe(true);
  });

  it("matches only listed project keys for a user profile", () => {
    expect(isProjectInProfile(work, "env-1:proj-1")).toBe(true);
    expect(isProjectInProfile(work, "env-1:proj-2")).toBe(false);
  });
});

describe("findProfile", () => {
  it("finds by id and returns undefined for null/undefined", () => {
    const profiles = resolveProfiles([work]);
    expect(findProfile(profiles, "work")).toEqual(work);
    expect(findProfile(profiles, null)).toBeUndefined();
    expect(findProfile(profiles, undefined)).toBeUndefined();
  });
});

describe("nextProfileId", () => {
  const profiles = resolveProfiles([work, home]);

  it("wraps forward past the last profile", () => {
    expect(nextProfileId(profiles, "home", "next")).toBe(ALL_PROFILE_ID);
  });

  it("wraps backward past the first profile", () => {
    expect(nextProfileId(profiles, ALL_PROFILE_ID, "previous")).toBe("home");
  });

  it("steps forward and backward from the middle", () => {
    expect(nextProfileId(profiles, "work", "next")).toBe("home");
    expect(nextProfileId(profiles, "work", "previous")).toBe(ALL_PROFILE_ID);
  });

  it("treats an unknown id as All", () => {
    expect(nextProfileId(profiles, "does-not-exist", "next")).toBe("work");
    expect(nextProfileId(profiles, "does-not-exist", "previous")).toBe("home");
  });
});

describe("Profile schema", () => {
  const decode = Schema.decodeUnknownSync(Profile);

  it("rejects an unknown color", () => {
    expect(() => decode({ id: "work", name: "Work", color: "magenta", projectKeys: [] })).toThrow();
  });

  it("decodes a valid profile", () => {
    expect(decode(work)).toEqual(work);
  });
});

describe("pin scopes", () => {
  it("keeps placement separate and falls back to profile when a space is removed or unassigned", () => {
    const profile = Schema.decodeUnknownSync(Profile)({
      ...work,
      spaces: [
        {
          id: "assigned",
          name: "Assigned",
          threads: [{ threadKey: "env-1:thread", projectKey: "env-1:proj-1" }],
        },
        { id: "other", name: "Other", threads: [] },
      ],
      threadPins: [{ threadKey: "env-1:thread", projectKey: "env-1:proj-1", spaceId: "assigned" }],
    });
    expect(indexProfilePins([profile]).get("env-1:thread")).toEqual({
      profileId: "work",
      spaceId: "assigned",
    });
    const outside = moveThreadsToSpace(
      profile,
      [{ threadKey: "env-1:thread", projectKey: "env-1:proj-1" }],
      null,
    );
    expect(indexProfilePins([outside]).get("env-1:thread")).toEqual({
      profileId: "work",
      spaceId: null,
    });
    expect(outside.threadPins?.[0]?.spaceId).toBeNull();
    expect(indexProfilePins([{ ...profile, spaces: [] }]).get("env-1:thread")).toEqual({
      profileId: "work",
      spaceId: null,
    });
    expect(
      indexProfilePins([
        { ...profile, threadPins: [{ ...profile.threadPins![0]!, spaceId: null }] },
      ]).get("env-1:thread"),
    ).toEqual({ profileId: "work", spaceId: null });
    expect(indexProfilePins([{ ...profile, projectKeys: [] }]).size).toBe(0);
  });
});

describe("mergeProfileEdits", () => {
  it("restores a removed row at its requested position", () => {
    expect(mergeProfileEdits([home], [home], [work, home]).map((profile) => profile.id)).toEqual([
      work.id,
      home.id,
    ]);
  });
  it("keeps concurrent chats added to the same space", () => {
    const base = [{ ...work, spaces: [{ id: "build", name: "Build", threads: [] }] }];
    const withChat = (threadKey: string) => [
      {
        ...work,
        spaces: [
          { id: "build", name: "Build", threads: [{ threadKey, projectKey: "env-1:proj-1" }] },
        ],
      },
    ];
    expect(
      mergeProfileEdits(withChat("a"), base, withChat("b"))[0]?.spaces?.[0]?.threads.map(
        (t) => t.threadKey,
      ),
    ).toEqual(["a", "b"]);
  });
  it("preserves another client's rename when adding a pin", () => {
    const current = [{ ...work, name: "Renamed" }];
    const edited = [
      { ...work, threadPins: [{ threadKey: "a:t", projectKey: "env-1:proj-1", spaceId: null }] },
    ];
    expect(mergeProfileEdits(current, [work], edited)[0]).toEqual({
      ...edited[0],
      name: "Renamed",
    });
  });
  it("rejects competing renames and does not resurrect deleted profiles", () => {
    expect(() =>
      mergeProfileEdits([{ ...work, name: "One" }], [work], [{ ...work, name: "Two" }]),
    ).toThrow();
    expect(() => mergeProfileEdits([], [work], [{ ...work, name: "Two" }])).toThrow();
  });
  it("keeps unrelated profiles and handles reorder with concurrent additions", () => {
    const third = { ...home, id: "third", projectKeys: [] };
    expect(
      mergeProfileEdits([work, home, third], [work, home], [home, work]).map((p) => p.id),
    ).toEqual([home.id, work.id, third.id]);
  });
  it("rejects concurrent assignments of one chat to two spaces", () => {
    const thread = { threadKey: "a:t", projectKey: "env-1:proj-1" };
    const base = [
      {
        ...work,
        spaces: [
          { id: "one", name: "One", threads: [] },
          { id: "two", name: "Two", threads: [] },
        ],
      },
    ];
    const assign = (id: string) =>
      base.map((p) => ({
        ...p,
        spaces: p.spaces.map((s) => ({ ...s, threads: s.id === id ? [thread] : [] })),
      }));
    expect(() => mergeProfileEdits(assign("one"), base, assign("two"))).toThrow("another space");
  });
});
