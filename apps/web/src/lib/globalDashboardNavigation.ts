import * as Schema from "effect/Schema";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from "../hooks/useLocalStorage";
import { randomUUID } from "./utils";

declare module "@tanstack/react-router" {
  interface HistoryState {
    globalDashboardActivation?: string;
    overviewActivation?: string;
  }
}

export type OverviewScope = { profileId: string; spaceId?: string | undefined; unsorted: boolean };

export function dashboardStorageScope(scope?: OverviewScope) {
  return scope
    ? `t3.dashboard.${scope.profileId}:${scope.spaceId ?? scope.unsorted}`
    : "t3.dashboard.global";
}

function clearDashboardFilters(storageScope: string) {
  for (const filter of [
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
  ]) {
    removeLocalStorageItem(`${storageScope}.${filter}`);
  }
}

/** Explicit entry resets only this scope; saved views and other scopes stay intact. */
export function scopedOverviewNavigation(scope: OverviewScope) {
  clearDashboardFilters(dashboardStorageScope(scope));
  return {
    to: "/spaces/$profileId" as const,
    params: { profileId: scope.profileId },
    search: { space: scope.spaceId, unsorted: scope.unsorted },
    state: { overviewActivation: randomUUID() },
  };
}

export function globalDashboardNavigation() {
  clearDashboardFilters(dashboardStorageScope());
  return {
    to: "/dashboard" as const,
    state: { globalDashboardActivation: randomUUID() },
  };
}

const RETURN_FILTERS = [
  "profileFilter",
  "spaceFilter",
  "device",
  "projectFilter",
  "providerFilter",
  "search",
  "branch",
  "pr",
  "visibility",
  "group",
];
export type DashboardReturnSnapshot = {
  storageScope: string;
  group: string;
  filters: Record<string, unknown>;
  detailed: boolean;
  scroll: Record<string, { top: number; left: number }>;
};

export function captureDashboardFilters(storageScope: string) {
  return Object.fromEntries(
    RETURN_FILTERS.map((name) => {
      try {
        return [name, getLocalStorageItem(`${storageScope}.${name}`, Schema.Unknown)];
      } catch {
        return [name, null];
      }
    }),
  );
}

export function restoreDashboardSnapshot(snapshot: DashboardReturnSnapshot) {
  try {
    for (const name of RETURN_FILTERS) {
      const key = `${snapshot.storageScope}.${name}`;
      const value = snapshot.filters[name];
      if (value === null || value === undefined) removeLocalStorageItem(key);
      else setLocalStorageItem(key, value, Schema.Unknown);
    }
    setLocalStorageItem("t3.dashboard.detailedCards", snapshot.detailed, Schema.Boolean);
    for (const [area, offset] of Object.entries(snapshot.scroll)) {
      const key = `${snapshot.storageScope}.${snapshot.group}.scroll`;
      if (area === "root") setLocalStorageItem(key, offset.top, Schema.Finite);
      else {
        setLocalStorageItem(`${key}.${area}.top`, offset.top, Schema.Finite);
        setLocalStorageItem(`${key}.${area}.left`, offset.left, Schema.Finite);
      }
    }
  } catch {
    /* Returning remains available if local storage is full or disabled. */
  }
}
