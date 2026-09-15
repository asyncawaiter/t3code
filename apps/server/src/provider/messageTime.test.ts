import { describe, expect, it } from "vite-plus/test";
import { formatMessageTime } from "./messageTime.ts";

describe("message time context", () => {
  it("separates queued submission, delivery and the gap across days", () => {
    expect(
      formatMessageTime(
        {
          submittedAt: "2026-09-07T09:30:00-04:00",
          previousUserMessageAt: "2026-09-04T16:15:00-04:00",
        },
        "2026-09-07T14:30:00Z",
      ),
    ).toContain(
      "User message submitted: 2026-09-07T13:30:00.000Z\nDelivered to agent: 2026-09-07T14:30:00.000Z\nPrevious user message submitted: 2026-09-04T20:15:00.000Z\nElapsed between user submissions: 2 days, 17 hours, 15 minutes, 0 seconds.",
    );
  });
  it("does not invent a previous message or a negative elapsed time", () => {
    expect(
      formatMessageTime({ submittedAt: "2026-09-07T00:00:00Z" }, "2026-09-07T00:00:01Z"),
    ).not.toContain("Previous user");
    expect(
      formatMessageTime(
        { submittedAt: "2026-09-07T00:00:00Z", previousUserMessageAt: "2026-09-08T00:00:00Z" },
        "2026-09-07T00:00:01Z",
      ),
    ).toContain("elapsed time is unknown");
  });
});

it("uses the client timezone across DST instead of the host timezone", () => {
  const text = formatMessageTime(
    {
      submittedAt: "2026-03-08T07:30:00Z",
      previousUserMessageAt: "2026-03-08T06:30:00Z",
      timeZone: "America/Toronto",
    },
    "2026-03-08T08:00:00Z",
  );
  expect(text).toContain("timezone America/Toronto");
  expect(text).toContain("User message submitted: 2026-03-08T03:30:00-04:00");
  expect(text).toContain("Previous user message submitted: 2026-03-08T01:30:00-05:00");
  expect(text).toContain("Delivered to agent: 2026-03-08T04:00:00-04:00");
  expect(text).toContain("0 days, 1 hours, 0 minutes, 0 seconds");
});
it("falls back to UTC for an invalid timezone from an older client", () => {
  expect(
    formatMessageTime(
      { submittedAt: "2026-09-14T00:00:00Z", timeZone: "invalid" },
      "2026-09-14T00:00:00Z",
    ),
  ).toContain("timezone UTC");
});
