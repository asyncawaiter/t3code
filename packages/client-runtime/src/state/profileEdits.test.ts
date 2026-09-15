import { expect, it } from "@effect/vitest";
import { EnvironmentId, type Profile } from "@t3tools/contracts";
import { createProfileEditQueue, inheritForkPlacement } from "./profileSync";

const sourceId = EnvironmentId.make("godel");
const base: ReadonlyArray<Profile> = [{ id: "work", name: "Work", color: "gray", projectKeys: [] }];
const addSpace = (id: string) => (profiles: ReadonlyArray<Profile>) =>
  profiles.map((profile) => ({
    ...profile,
    spaces: [...(profile.spaces ?? []), { id, name: id, threads: [] }],
  }));
function setup() {
  let stored: string | null = null;
  let remote = base;
  let failSave = false;
  const storage = {
    read: async () => stored,
    write: async (value: string) => {
      stored = value;
    },
    changed: () => {},
  };
  const io = {
    canSync: () => true,
    read: async () => ({ profiles: remote, profileSyncSourceId: sourceId }),
    save: async (_id: EnvironmentId, profiles: ReadonlyArray<Profile>) => {
      remote = profiles;
      if (failSave) throw new Error("Lost acknowledgement");
    },
  };
  return {
    storage,
    io,
    remote: () => remote,
    replaceRemote: (profiles: ReadonlyArray<Profile>) => {
      remote = profiles;
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
  };
}

it("keeps offline Space creation across restart and merges another device's new Space", async () => {
  const test = setup();
  const first = createProfileEditQueue(test.storage);
  await first.edit(sourceId, base, addSpace("local"));
  await first.flush({
    ...test.io,
    canSync: () => false,
    read: async () => {
      throw new Error("Must not read offline");
    },
  });
  const restarted = createProfileEditQueue(test.storage);
  await restarted.ready;
  expect(restarted.snapshot().draft?.profiles[0]?.spaces?.[0]?.id).toBe("local");
  test.replaceRemote(addSpace("remote")(base));
  await restarted.flush(test.io);
  expect(test.remote()[0]?.spaces?.map((space) => space.id)).toEqual(["remote", "local"]);
  expect(restarted.snapshot().draft).toBeNull();
});

it("retries a lost acknowledgement without creating a duplicate Space", async () => {
  const test = setup();
  const queue = createProfileEditQueue(test.storage);
  await queue.edit(sourceId, base, addSpace("local"));
  test.failSave(true);
  await queue.flush(test.io);
  expect(queue.snapshot().draft).not.toBeNull();
  test.failSave(false);
  await queue.flush(test.io);
  expect(test.remote()[0]?.spaces).toHaveLength(1);
  expect(queue.snapshot().draft).toBeNull();
});

it("retains edits made during a sync and serializes their next write", async () => {
  const test = setup();
  const queue = createProfileEditQueue(test.storage);
  await queue.edit(sourceId, base, addSpace("first"));
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let calls = 0;
  const flushing = queue.flush({
    ...test.io,
    save: async (id, profiles) => {
      if (++calls === 1) {
        started.resolve();
        await finish.promise;
      }
      await test.io.save(id, profiles);
    },
  });
  await started.promise;
  await queue.edit(sourceId, base, addSpace("second"));
  await expect(queue.discard()).rejects.toThrow("Wait");
  finish.resolve();
  await flushing;
  expect(test.remote()[0]?.spaces?.map((space) => space.id)).toEqual(["first", "second"]);
  expect(queue.snapshot().draft).toBeNull();
});

it("preserves pending edits when the source changes or a remote profile is deleted", async () => {
  const test = setup();
  const queue = createProfileEditQueue(test.storage);
  await queue.edit(sourceId, base, addSpace("local"));
  await queue.flush({
    ...test.io,
    read: async () => ({ profiles: base, profileSyncSourceId: EnvironmentId.make("poly") }),
  });
  expect(queue.snapshot().error).toContain("source changed");
  expect(queue.snapshot().draft?.profiles[0]?.spaces).toHaveLength(1);
  await expect(queue.edit(EnvironmentId.make("poly"), base, addSpace("wrong"))).rejects.toThrow(
    "source",
  );
  test.replaceRemote([]);
  await queue.flush(test.io);
  expect(queue.snapshot().error).not.toBeNull();
  expect(test.remote()).toEqual([]);
  expect(queue.snapshot().draft).not.toBeNull();
  await queue.discard();
  expect(queue.snapshot().draft).toBeNull();
});

it("never reports edits as saved when local storage fails, or overwrites an unreadable queue", async () => {
  const test = setup();
  const queue = createProfileEditQueue({
    ...test.storage,
    write: async () => {
      throw new Error("Disk full");
    },
  });
  await expect(queue.edit(sourceId, base, addSpace("local"))).rejects.toThrow("Disk full");
  expect(queue.snapshot().draft).toBeNull();
  const corrupt = createProfileEditQueue({ ...test.storage, read: async () => "{broken" });
  await expect(corrupt.edit(sourceId, base, addSpace("local"))).rejects.toThrow("load pending");
  expect(corrupt.snapshot().loaded).toBe(false);
});

it("preserves concurrent edits from two windows sharing local storage", async () => {
  const test = setup();
  const locks = new Map<string, Promise<void>>();
  const storage = {
    ...test.storage,
    lock: (scope: string, run: () => Promise<void>) => {
      const next = (locks.get(scope) ?? Promise.resolve()).then(run);
      locks.set(
        scope,
        next.catch(() => {}),
      );
      return next;
    },
  };
  const first = createProfileEditQueue(storage);
  const second = createProfileEditQueue(storage);
  await Promise.all([
    first.edit(sourceId, base, addSpace("first")),
    second.edit(sourceId, base, addSpace("second")),
  ]);
  await Promise.all([first.flush(test.io), second.flush(test.io)]);
  await first.refresh();
  expect(test.remote()[0]?.spaces?.map((space) => space.id)).toEqual(["first", "second"]);
  expect(first.snapshot().draft).toBeNull();
  expect(second.snapshot().draft).toBeNull();
});

it("persists a fork's source Space while the profile host is offline and syncs after restart", async () => {
  const test = setup();
  const profiles: ReadonlyArray<Profile> = [
    {
      ...base[0]!,
      projectKeys: ["poly:repo"],
      spaces: [
        {
          id: "pod",
          name: "POD",
          threads: [{ threadKey: "poly:source", projectKey: "poly:repo" }],
        },
      ],
    },
  ];
  test.replaceRemote(profiles);
  const queue = createProfileEditQueue(test.storage);
  await queue.edit(sourceId, profiles, (latest) =>
    inheritForkPlacement(latest, {
      environmentId: "poly",
      projectId: "repo",
      sourceThreadId: "source",
      threadId: "fork",
    }),
  );
  await queue.flush({ ...test.io, canSync: () => false });
  const restarted = createProfileEditQueue(test.storage);
  await restarted.ready;
  expect(
    restarted.snapshot().draft?.profiles[0]?.spaces?.[0]?.threads.map((thread) => thread.threadKey),
  ).toEqual(["poly:source", "poly:fork"]);
  await restarted.flush(test.io);
  expect(test.remote()[0]?.spaces?.[0]?.threads.map((thread) => thread.threadKey)).toEqual([
    "poly:source",
    "poly:fork",
  ]);
  expect(restarted.snapshot().draft).toBeNull();
});
