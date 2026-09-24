import { captureDashboardFilters, restoreDashboardSnapshot } from "./globalDashboardNavigation";
import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from "../hooks/useLocalStorage";
import {
  globalDashboardNavigation,
  scopedOverviewNavigation,
  dashboardStorageScope,
} from "./globalDashboardNavigation";

it("opens a fresh global dashboard without deleting saved views or Space filters", () => {
  const filters = [
    "profileFilter",
    "spaceFilter",
    "scroll",
    "device",
    "projectFilter",
    "providerFilter",
    "search",
    "branch",
    "pr",
    "visibility",
  ];
  const preserved = [
    "t3.dashboard.savedViews",
    "t3.dashboard.work:pod.device",
    "t3.dashboard.global.group",
  ];
  for (const filter of filters)
    setLocalStorageItem(`t3.dashboard.global.${filter}`, "narrowed", Schema.String);
  for (const key of preserved) setLocalStorageItem(key, "keep", Schema.String);
  try {
    const first = globalDashboardNavigation();
    expect(first.to).toBe("/dashboard");
    expect(globalDashboardNavigation().state.globalDashboardActivation).not.toBe(
      first.state.globalDashboardActivation,
    );
    for (const filter of filters)
      expect(getLocalStorageItem(`t3.dashboard.global.${filter}`, Schema.String)).toBeNull();
    for (const key of preserved) expect(getLocalStorageItem(key, Schema.String)).toBe("keep");
  } finally {
    for (const key of preserved) removeLocalStorageItem(key);
  }
});

it("opens profile and space overviews with independent fresh filters", () => {
  const profile = { profileId: "work", unsorted: false };
  const space = { ...profile, spaceId: "pod" };
  const unsorted = { profileId: "work", unsorted: true };
  const scopes = [profile, space, unsorted];
  const keys = scopes.map((scope) => `${dashboardStorageScope(scope)}.search`);
  for (const key of keys) setLocalStorageItem(key, "narrowed", Schema.String);
  setLocalStorageItem("t3.dashboard.savedViews", "keep", Schema.String);
  setLocalStorageItem("t3.dashboard.global.search", "global", Schema.String);
  try {
    const first = scopedOverviewNavigation(profile);
    expect(first).toMatchObject({
      to: "/spaces/$profileId",
      params: { profileId: "work" },
      search: { space: undefined, unsorted: false },
    });
    expect(getLocalStorageItem(keys[0]!, Schema.String)).toBeNull();
    expect(getLocalStorageItem(keys[1]!, Schema.String)).toBe("narrowed");
    expect(scopedOverviewNavigation(profile).state.overviewActivation).not.toBe(
      first.state.overviewActivation,
    );
    expect(scopedOverviewNavigation(space).search).toEqual({ space: "pod", unsorted: false });
    expect(getLocalStorageItem(keys[1]!, Schema.String)).toBeNull();
    expect(getLocalStorageItem(keys[2]!, Schema.String)).toBe("narrowed");
    expect(scopedOverviewNavigation(unsorted).search).toEqual({ space: undefined, unsorted: true });
    expect(getLocalStorageItem(keys[2]!, Schema.String)).toBeNull();
    expect(getLocalStorageItem("t3.dashboard.global.search", Schema.String)).toBe("global");
    expect(getLocalStorageItem("t3.dashboard.savedViews", Schema.String)).toBe("keep");
  } finally {
    for (const key of [...keys, "t3.dashboard.savedViews", "t3.dashboard.global.search"])
      removeLocalStorageItem(key);
  }
});

it("restores the departing dashboard filters, density and independent lane offsets", () => {
  const scope = "t3.dashboard.return-test";
  setLocalStorageItem(`${scope}.search`, "release", Schema.String);
  setLocalStorageItem(`${scope}.providerFilter`, "codex", Schema.String);
  const filters = captureDashboardFilters(scope);
  setLocalStorageItem(`${scope}.search`, "different", Schema.String);
  restoreDashboardSnapshot({
    storageScope: scope,
    group: "state",
    filters,
    detailed: true,
    scroll: {
      running: { top: 240, left: 0 },
      idle: { top: 110, left: 0 },
      board: { left: 50, top: 0 },
    },
  });
  expect(getLocalStorageItem(`${scope}.search`, Schema.String)).toBe("release");
  expect(getLocalStorageItem(`${scope}.providerFilter`, Schema.String)).toBe("codex");
  expect(getLocalStorageItem(`${scope}.state.scroll.running.top`, Schema.Finite)).toBe(240);
  expect(getLocalStorageItem(`${scope}.state.scroll.idle.top`, Schema.Finite)).toBe(110);
  expect(getLocalStorageItem(`${scope}.state.scroll.board.left`, Schema.Finite)).toBe(50);
  expect(getLocalStorageItem("t3.dashboard.detailedCards", Schema.Boolean)).toBe(true);
  removeLocalStorageItem("t3.dashboard.detailedCards");
});
