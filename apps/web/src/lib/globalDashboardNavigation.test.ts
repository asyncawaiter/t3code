import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from "../hooks/useLocalStorage";
import { globalDashboardNavigation } from "./globalDashboardNavigation";

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
