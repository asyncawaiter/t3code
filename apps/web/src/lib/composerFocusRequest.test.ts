import { expect, it, vi } from "vite-plus/test";

import {
  claimComposerFocus,
  requestComposerFocus,
  subscribeComposerFocusRequests,
} from "./composerFocusRequest";

it("hands the request to the matching thread once, and notifies waiting panes", () => {
  let notified = 0;
  const unsubscribe = subscribeComposerFocusRequests(() => {
    notified += 1;
  });
  requestComposerFocus("env:a");
  expect(notified).toBe(1);
  expect(claimComposerFocus("env:b")).toBe(false);
  expect(claimComposerFocus("env:a")).toBe(true);
  expect(claimComposerFocus("env:a")).toBe(false);
  unsubscribe();
  requestComposerFocus("env:b");
  expect(notified).toBe(1);
  expect(claimComposerFocus("env:b")).toBe(true);
});

it("drops a request that was never claimed in time", () => {
  vi.useFakeTimers();
  try {
    requestComposerFocus("env:c");
    vi.advanceTimersByTime(3001);
    expect(claimComposerFocus("env:c")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
