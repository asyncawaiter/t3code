import { expect, it } from "vite-plus/test";
import { THREAD_SIDEBAR_MIN_WIDTH, resolveInitialThreadSidebarWidth } from "./threadSidebarWidth";

it("keeps the three-column minimum when restoring narrow widths and allows expansion", () => {
  expect(resolveInitialThreadSidebarWidth(208, 1440)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  expect(resolveInitialThreadSidebarWidth(null, 1440)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  expect(resolveInitialThreadSidebarWidth(480, 1440)).toBe(480);
  expect(resolveInitialThreadSidebarWidth(480, 800)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
});
