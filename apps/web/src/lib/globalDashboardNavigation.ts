import { removeLocalStorageItem } from "../hooks/useLocalStorage";
import { randomUUID } from "./utils";

declare module "@tanstack/react-router" {
  interface HistoryState {
    globalDashboardActivation?: string;
  }
}

/** Explicit global entry clears narrowing; saved views and Space preferences stay intact. */
export function globalDashboardNavigation() {
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
    removeLocalStorageItem(`t3.dashboard.global.${filter}`);
  }
  return {
    to: "/dashboard" as const,
    state: { globalDashboardActivation: randomUUID() },
  };
}
