import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  assistantMessageIdFromLocation,
  assistantMessageNavigation,
} from "./assistantMessageNavigation";

describe("assistant message navigation", () => {
  it("round trips a message id through the navigation hash", () => {
    const environmentId = EnvironmentId.make("environment-one");
    const threadId = ThreadId.make("thread-one");
    const messageId = MessageId.make("assistant-one");

    const navigation = assistantMessageNavigation({ environmentId, threadId, messageId });
    const href = `/${environmentId}/${threadId}#${navigation.hash}`;

    expect(assistantMessageIdFromLocation(href)).toBe(messageId);
  });

  it("ignores non-message fragments and missing fragments", () => {
    expect(assistantMessageIdFromLocation("/environment-one/thread-one")).toBeNull();
    expect(
      assistantMessageIdFromLocation("/environment-one/thread-one#ordinary-heading"),
    ).toBeNull();
    expect(assistantMessageIdFromLocation("/a/b#assistant-message=")).toBeNull();
  });

  it("returns null for a malformed percent-encoded message id instead of throwing", () => {
    expect(() => assistantMessageIdFromLocation("/a/b#assistant-message=%")).not.toThrow();
    expect(assistantMessageIdFromLocation("/a/b#assistant-message=%")).toBeNull();
  });
});
