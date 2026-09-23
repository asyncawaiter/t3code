import { expect, it } from "vite-plus/test";
import { workspaceView } from "./workspaceView";

it("preserves supported views and maps old Monitor links to Columns", () => {
  expect(workspaceView("monitor")).toBe("columns");
  for (const view of ["columns", "folders", "branches"]) {
    expect(workspaceView(view)).toBe(view);
  }
  expect(workspaceView(undefined)).toBeUndefined();
  expect(workspaceView("invalid")).toBeUndefined();
});

import { isColumnsLocation, chatLocationToRemember } from "./columnNavigation";
it("uses the rail only for column routes, including legacy Monitor links", () => {
  expect(isColumnsLocation("/spaces/all", "?view=columns")).toBe(true);
  expect(isColumnsLocation("/spaces/work", "?view=monitor&space=pod")).toBe(true);
  expect(isColumnsLocation("/spaces/work", "?view=folders")).toBe(false);
  expect(isColumnsLocation("/device/chat", "?view=columns")).toBe(false);
  expect(isColumnsLocation("/dashboard", "")).toBe(false);
});

it("does not replace the last chat with an incoming columns or overview URL", () => {
  expect(chatLocationToRemember("/device/chat", "/device/chat?diff=true", "/device/chat")).toBe(
    "/device/chat?diff=true",
  );
  expect(
    chatLocationToRemember("/spaces/all", "/spaces/all?view=columns", "/device/chat"),
  ).toBeNull();
  expect(
    chatLocationToRemember("/spaces/work", "/spaces/work?space=pod", "/device/chat"),
  ).toBeNull();
  expect(chatLocationToRemember("/draft/one", "/draft/one", "/draft/one")).toBe("/draft/one");
});

import { DEFAULT_CHAT_BOARD } from "@t3tools/contracts";
import { isDashboardLocation, usesColumnsRail, boardWithOpenedChat } from "./columnNavigation";

it("retains the Columns rail across all dashboard scopes and folder views", () => {
  for (const [path, search] of [
    ["/dashboard", ""],
    ["/spaces/work", "?unsorted=false"],
    ["/spaces/work", "?space=pod&unsorted=false"],
    ["/spaces/work", "?unsorted=true"],
  ]) {
    expect(isDashboardLocation(path!, search!)).toBe(true);
    expect(usesColumnsRail(path!, search!, "columns")).toBe(true);
    expect(usesColumnsRail(path!, search!, "chat")).toBe(false);
  }
  expect(isDashboardLocation("/spaces/work", "?view=folders")).toBe(false);
  expect(usesColumnsRail("/spaces/work", "?view=folders", "columns")).toBe(true);
  expect(usesColumnsRail("/device/thread", "", "columns")).toBe(false);
  expect(usesColumnsRail("/settings", "", "columns")).toBe(false);
  expect(usesColumnsRail("/spaces/all", "?view=columns", "chat")).toBe(true);
});

it("opens a dashboard chat without replacing, reordering or duplicating existing columns", () => {
  const board = {
    ...DEFAULT_CHAT_BOARD,
    order: ["poly:one", "godel:two"],
    widths: { "poly:one": 540, "godel:two": 380 },
    hidden: ["godel:two"],
    kept: ["poly:one"],
  };
  const existing = { key: "poly:one", title: "Existing", context: "POD", reference: false };
  expect(boardWithOpenedChat(board, existing)).toBe(board);
  const reopened = boardWithOpenedChat(board, { ...existing, key: "godel:two" });
  expect(reopened.order).toEqual(board.order);
  expect(reopened.hidden).toEqual([]);
  expect(reopened.widths).toBe(board.widths);
  const added = boardWithOpenedChat(reopened, { ...existing, key: "poly:three", reference: true });
  expect(added.order).toEqual(["poly:one", "godel:two", "poly:three"]);
  expect(added.kept).toEqual(["poly:one", "poly:three"]);
  expect(added.widths).toBe(board.widths);
  expect(boardWithOpenedChat(added, { ...existing, key: "poly:three", reference: true })).toBe(
    added,
  );
  expect(board.order).toEqual(["poly:one", "godel:two"]);
  expect(board.hidden).toEqual(["godel:two"]);
});

it("keeps a moved draft in its original column position and carries its width to the new device", () => {
  const board = {
    ...DEFAULT_CHAT_BOARD,
    order: ["poly:one", "godel:draft", "godel:two"],
    widths: { "godel:draft": 550 },
    hidden: ["godel:draft"],
    labels: { "godel:draft": { title: "Draft", context: "Old folder" } },
  };
  const moved = boardWithOpenedChat(board, {
    previousKey: "godel:draft",
    key: "poly:draft",
    title: "New chat",
    context: "New folder",
    reference: false,
  });
  expect(moved.order).toEqual(["poly:one", "poly:draft", "godel:two"]);
  expect(moved.widths).toEqual({ "poly:draft": 550 });
  expect(moved.hidden).toEqual([]);
  expect(moved.labels).toEqual({ "poly:draft": { title: "New chat", context: "New folder" } });
  expect(board.order[1]).toBe("godel:draft");
});
