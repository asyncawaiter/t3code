import { expect, it } from "@effect/vitest";

import { canReplaceThreadTitle, DEFAULT_THREAD_TITLE } from "./threadTitles.ts";

it("automatic titles preserve numbered forks while replacing a new thread's seed", () => {
  const seed = "Summarize the inherited task";
  expect(canReplaceThreadTitle("Create check file (fork 2)", seed)).toBe(false);
  expect(canReplaceThreadTitle(DEFAULT_THREAD_TITLE, seed)).toBe(true);
  expect(canReplaceThreadTitle(seed, seed)).toBe(true);
});
