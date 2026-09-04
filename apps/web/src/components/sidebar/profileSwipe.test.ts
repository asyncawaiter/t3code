import { describe, expect, it } from "vite-plus/test";

import {
  INITIAL_PROFILE_SWIPE_STATE,
  reduceProfileSwipe,
  type ProfileSwipeState,
} from "./profileSwipe";

function feed(
  events: ReadonlyArray<{ deltaX: number; deltaY: number; timestamp: number }>,
): ReadonlyArray<"next" | "previous" | null> {
  let state: ProfileSwipeState = INITIAL_PROFILE_SWIPE_STATE;
  const fires: Array<"next" | "previous" | null> = [];
  for (const event of events) {
    const result = reduceProfileSwipe(state, event);
    state = result.state;
    fires.push(result.fire);
  }
  return fires;
}

describe("reduceProfileSwipe", () => {
  it("fires once per gesture once the threshold is crossed", () => {
    const fires = feed([
      { deltaX: 30, deltaY: 0, timestamp: 0 },
      { deltaX: 30, deltaY: 0, timestamp: 20 },
      { deltaX: 30, deltaY: 0, timestamp: 40 },
      { deltaX: 30, deltaY: 0, timestamp: 60 },
    ]);
    expect(fires.filter((fire) => fire !== null)).toEqual(["next"]);
  });

  it("does not fire on vertical scroll", () => {
    const fires = feed([
      { deltaX: 5, deltaY: 40, timestamp: 0 },
      { deltaX: 5, deltaY: 40, timestamp: 20 },
      { deltaX: 5, deltaY: 40, timestamp: 40 },
      { deltaX: 5, deltaY: 40, timestamp: 60 },
      { deltaX: 5, deltaY: 40, timestamp: 80 },
    ]);
    expect(fires.every((fire) => fire === null)).toBe(true);
  });

  it("maps positive accumulated deltaX to next and negative to previous", () => {
    const nextFires = feed([
      { deltaX: 45, deltaY: 0, timestamp: 0 },
      { deltaX: 45, deltaY: 0, timestamp: 20 },
    ]);
    expect(nextFires).toEqual([null, "next"]);

    const previousFires = feed([
      { deltaX: -45, deltaY: 0, timestamp: 0 },
      { deltaX: -45, deltaY: 0, timestamp: 20 },
    ]);
    expect(previousFires).toEqual([null, "previous"]);
  });

  it("clamps a single large event so one Shift+wheel notch cannot fire alone", () => {
    const fires = feed([{ deltaX: 100, deltaY: 0, timestamp: 0 }]);
    expect(fires).toEqual([null]);
  });

  it("fires once two clamped events cross the threshold together", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 60, deltaY: 0, timestamp: 20 },
    ]);
    expect(fires).toEqual([null, "next"]);
  });

  it("a vertically dominated event resets the accumulator instead of just being skipped", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 1, deltaY: 20, timestamp: 20 },
      { deltaX: 60, deltaY: 0, timestamp: 40 },
    ]);
    // The vertical event at t=20 resets the 60px accumulation, so the 60px
    // event at t=40 starts over and does not cross the threshold alone.
    expect(fires).toEqual([null, null, null]);
  });

  it("a long vertical scroll with horizontal jitter never fires", () => {
    const events = [];
    for (let index = 0; index < 20; index += 1) {
      events.push({ deltaX: index % 2 === 0 ? 10 : 0, deltaY: 40, timestamp: index * 20 });
    }
    const fires = feed(events);
    expect(fires.every((fire) => fire === null)).toBe(true);
  });

  it("locks for the rest of the gesture after firing", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 60, deltaY: 0, timestamp: 20 },
      { deltaX: 60, deltaY: 0, timestamp: 40 },
    ]);
    expect(fires).toEqual([null, "next", null]);
  });

  it("fires again for a new gesture after the idle gap", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 60, deltaY: 0, timestamp: 20 },
      { deltaX: 60, deltaY: 0, timestamp: 400 },
      { deltaX: 60, deltaY: 0, timestamp: 420 },
    ]);
    expect(fires).toEqual([null, "next", null, "next"]);
  });
});
