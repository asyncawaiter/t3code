import { expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { columnOrder } from "./ChatColumns";
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
