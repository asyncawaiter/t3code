import { removeLocalStorageItem } from "../hooks/useLocalStorage";
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
