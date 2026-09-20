import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { columnOrder, columnWidth, boardChats } from "./ChatColumns";
it("keeps column order stable, appends new chats, and only retains explicitly chosen settled chats", () => {
  const chat = (id: string) => ({
    id: ThreadId.make(id),
    environmentId: EnvironmentId.make("device"),
    createdAt: `2026-09-${id}T00:00:00.000Z`,
    archivedAt: null,
    settledOverride: null,
  });
  const old = chat("01"),
    recent = chat("02"),
    added = chat("03");
  const layout = { order: ["device:02", "device:01"], hidden: [], kept: [] };
  expect(columnOrder([old, recent, added], layout).map((item) => item.id)).toEqual([
    "02",
    "01",
    "03",
  ]);
  expect(
    columnOrder([{ ...recent, settledOverride: "settled" }, old], layout).map((item) => item.id),
  ).toEqual(["01"]);
  expect(
    columnOrder([{ ...recent, settledOverride: "settled" }, old], {
      ...layout,
      kept: ["device:02"],
      hidden: ["device:01"],
    }).map((item) => item.id),
  ).toEqual(["02"]);
  expect(columnOrder([{ ...recent, archivedAt: "2026-09-20T00:00:00.000Z" }], layout)).toEqual([]);
});

it("mixes explicit chats from other Spaces and devices without importing every chat", () => {
  const chat = (device: string, id: string) => ({
    environmentId: EnvironmentId.make(device),
    id: ThreadId.make(id),
    archivedAt: null,
    settledOverride: null,
    createdAt: "2026-09-20",
  });
  const local = chat("local", "one");
  const remote = chat("remote", "one");
  const unrelated = chat("remote", "two");
  const settled = { ...chat("remote", "reference"), settledOverride: "settled" as const };
  const candidates = boardChats(
    [local],
    [local, remote, unrelated, settled],
    ["local:one", "remote:one", "remote:reference", "missing:chat"],
  );
  expect(candidates).toEqual([local, remote, settled]);
  expect(
    columnOrder(candidates, {
      order: ["remote:reference", "remote:one", "local:one"],
      kept: ["remote:reference"],
      hidden: [],
    }),
  ).toEqual([settled, remote, local]);
  expect(columnOrder(candidates, { order: [], kept: [], hidden: ["remote:one"] })).toEqual([local]);
});
it("bounds independently saved widths to a usable range", () => {
  const widths = { first: columnWidth(560), second: columnWidth(380) };
  expect(widths).toEqual({ first: 560, second: 380 });
  expect(columnWidth(100)).toBe(340);
  expect(columnWidth(4000)).toBe(1000);
  expect(columnWidth(NaN)).toBe(420);
});
