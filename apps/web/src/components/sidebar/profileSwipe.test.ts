import { describe, expect, it } from "vite-plus/test";

import {
  INITIAL_PROFILE_SWIPE_STATE,
  INITIAL_NATIVE_PROFILE_SWIPE_STATE,
  reduceProfileSwipe,
  reduceNativeProfileSwipe,
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
      { deltaX: 30, deltaY: 0, timestamp: 40 },
    ]);
    expect(nextFires).toEqual([null, null, "next"]);

    const previousFires = feed([
      { deltaX: -45, deltaY: 0, timestamp: 0 },
      { deltaX: -45, deltaY: 0, timestamp: 20 },
      { deltaX: -30, deltaY: 0, timestamp: 40 },
    ]);
    expect(previousFires).toEqual([null, null, "previous"]);
  });

  it("clamps a single large event so one Shift+wheel notch cannot fire alone", () => {
    const fires = feed([{ deltaX: 100, deltaY: 0, timestamp: 0 }]);
    expect(fires).toEqual([null]);
  });

  it("ignores the previous threshold and requires a longer deliberate swipe", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 60, deltaY: 0, timestamp: 20 },
      { deltaX: 8, deltaY: 0, timestamp: 30 },
      { deltaX: 21, deltaY: 0, timestamp: 40 },
      { deltaX: 1, deltaY: 0, timestamp: 50 },
    ]);
    expect(fires).toEqual([null, null, null, null, "next"]);
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
      { deltaX: 30, deltaY: 0, timestamp: 30 },
      { deltaX: 60, deltaY: 0, timestamp: 40 },
    ]);
    expect(fires).toEqual([null, null, "next", null]);
  });

  it("fires again for a new gesture after the idle gap", () => {
    const fires = feed([
      { deltaX: 60, deltaY: 0, timestamp: 0 },
      { deltaX: 60, deltaY: 0, timestamp: 20 },
      { deltaX: 30, deltaY: 0, timestamp: 30 },
      { deltaX: 60, deltaY: 0, timestamp: 400 },
      { deltaX: 60, deltaY: 0, timestamp: 420 },
      { deltaX: 30, deltaY: 0, timestamp: 440 },
    ]);
    expect(fires).toEqual([null, null, "next", null, null, "next"]);
  });

  it("accepts a deliberate reversal after meaningful motion pauses", () => {
    const fires = feed([
      { deltaX: 40, deltaY: 0, timestamp: 0 },
      { deltaX: 40, deltaY: 0, timestamp: 20 },
      { deltaX: 30, deltaY: 0, timestamp: 60 },
      { deltaX: 1, deltaY: 0, timestamp: 110 },
      { deltaX: -40, deltaY: 0, timestamp: 200 },
      { deltaX: -40, deltaY: 0, timestamp: 220 },
      { deltaX: -30, deltaY: 0, timestamp: 240 },
    ]);
    expect(fires.filter(Boolean)).toEqual(["next", "previous"]);
  });

  it("accepts a new swipe after a quiet momentum tail", () => {
    const fires = feed([
      { deltaX: 40, deltaY: 0, timestamp: 0 },
      { deltaX: 40, deltaY: 0, timestamp: 20 },
      { deltaX: 30, deltaY: 0, timestamp: 60 },
      { deltaX: 1, deltaY: 0, timestamp: 110 },
      { deltaX: 3, deltaY: 0, timestamp: 160 },
      { deltaX: 7, deltaY: 0, timestamp: 180 },
      { deltaX: 12, deltaY: 0, timestamp: 200 },
      { deltaX: 30, deltaY: 0, timestamp: 220 },
      { deltaX: 40, deltaY: 0, timestamp: 240 },
      { deltaX: 30, deltaY: 0, timestamp: 260 },
    ]);
    expect(fires.filter(Boolean)).toEqual(["next", "next"]);
  });

  it("keeps small diagonal interruptions from erasing horizontal progress", () => {
    const fires = feed([
      { deltaX: 30, deltaY: 0, timestamp: 0 },
      { deltaX: 30, deltaY: 0, timestamp: 20 },
      { deltaX: 1, deltaY: 2, timestamp: 40 },
      { deltaX: 30, deltaY: 0, timestamp: 60 },
      { deltaX: 20, deltaY: 0, timestamp: 80 },
    ]);
    expect(fires.filter(Boolean)).toEqual(["next"]);
  });

  it("does not mistake continued motion, decaying momentum, or tiny rebounds for swipes", () => {
    const deltas = [40, 40, 60, 70, 60, 40, 30, 20, 10, 5, 1, -1, -2, 1, 3, 1];
    const fires = feed(
      deltas.map((deltaX, index) => ({ deltaX, deltaY: 0, timestamp: index * 20 })),
    );
    expect(fires.filter(Boolean)).toEqual(["next"]);
  });
  it("does not rearm after a zero delta within a continuous swipe", () => {
    const deltas = [40, 40, 40, 30, 20, 0, 20, 20, 20, 20, 20, 20, 20, 20];
    expect(
      feed(deltas.map((deltaX, index) => ({ deltaX, deltaY: 0, timestamp: index * 20 }))).filter(
        Boolean,
      ),
    ).toEqual(["next"]);
  });
  it("allows another swipe while a quiet momentum tail is still arriving", () => {
    const events = [40, 40, 40, 4, 3, 2, 1, 1, 1, 1, 1, 40, 40, 40].map((deltaX, index) => ({
      deltaX,
      deltaY: 0,
      timestamp: index * 20,
    }));
    expect(feed(events).filter(Boolean)).toEqual(["next", "next"]);
  });

  it("never lets a long faint tail accumulate into another switch", () => {
    const deltas = [40, 40, 40, ...Array.from({ length: 200 }, () => 2)];
    expect(
      feed(deltas.map((deltaX, index) => ({ deltaX, deltaY: 0, timestamp: index * 20 }))).filter(
        Boolean,
      ),
    ).toEqual(["next"]);
  });
});

describe("native profile swipes", () => {
  function play(inputs: Parameters<typeof reduceNativeProfileSwipe>[1][]) {
    let state = INITIAL_NATIVE_PROFILE_SWIPE_STATE;
    const fires = [];
    for (const input of inputs) {
      const result = reduceNativeProfileSwipe(state, input);
      state = result.state;
      if (result.fire) fires.push(result.fire);
    }
    return fires;
  }

  const wheel = (deltaX: number, deltaY = 0) => ({ type: "wheel" as const, deltaX, deltaY });

  it("rearms consecutive swipes and reversals on begin, with no clock or cooldown", () => {
    expect(
      play([
        { type: "begin" },
        wheel(40),
        wheel(40),
        wheel(40),
        { type: "end" },
        { type: "begin" },
        wheel(40),
        wheel(40),
        wheel(40),
        { type: "end" },
        { type: "begin" },
        wheel(-40),
        wheel(-40),
        wheel(-40),
        { type: "end" },
      ]),
    ).toEqual(["next", "next", "previous"]);
  });

  it("does not turn continued movement, a reversal, or post-end momentum into another swipe", () => {
    expect(
      play([
        wheel(200),
        { type: "begin" },
        wheel(40),
        wheel(40),
        wheel(40),
        wheel(500),
        wheel(0),
        wheel(-500),
        { type: "end" },
        wheel(200),
        wheel(150),
        wheel(100),
        wheel(50),
      ]),
    ).toEqual(["next"]);
  });

  it("keeps vertical gestures locked vertically and does not combine short gestures", () => {
    expect(
      play([
        { type: "begin" },
        wheel(5, 40),
        wheel(150, 0),
        { type: "end" },
        { type: "begin" },
        wheel(60),
        { type: "end" },
        { type: "begin" },
        wheel(60),
        { type: "end" },
        { type: "begin" },
        wheel(5, 2),
        wheel(55, 3),
        wheel(50, 2),
        { type: "end" },
      ]),
    ).toEqual(["next"]);
  });
});
