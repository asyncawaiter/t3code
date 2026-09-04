/**
 * Pure reducer for trackpad-swipe profile switching in the sidebar. A
 * "gesture" is a run of wheel events with gaps under `GESTURE_IDLE_MS`;
 * horizontal delta accumulates only while an event is horizontally
 * dominant, resets to zero on a vertically-dominant event so a long
 * vertical scroll with occasional horizontal jitter never fires, and
 * firing locks until the gesture ends so one swipe can't fire twice.
 */

const GESTURE_IDLE_MS = 250;
const FIRE_THRESHOLD = 80;
// One Shift+wheel notch can report a single deltaX of 100+, well past
// FIRE_THRESHOLD by itself. Clamp each event's contribution so a swipe
// still takes at least two notches to fire.
const MAX_EVENT_DELTA = 40;

export interface ProfileSwipeState {
  lastEventAt: number | null;
  accumulatedDeltaX: number;
  locked: boolean;
}

export const INITIAL_PROFILE_SWIPE_STATE: ProfileSwipeState = {
  lastEventAt: null,
  accumulatedDeltaX: 0,
  locked: false,
};

export interface ProfileSwipeInput {
  deltaX: number;
  deltaY: number;
  timestamp: number;
}

export interface ProfileSwipeResult {
  state: ProfileSwipeState;
  fire: "next" | "previous" | null;
}

export function reduceProfileSwipe(
  state: ProfileSwipeState,
  input: ProfileSwipeInput,
): ProfileSwipeResult {
  const isNewGesture =
    state.lastEventAt === null || input.timestamp - state.lastEventAt >= GESTURE_IDLE_MS;
  const accumulatedDeltaX = isNewGesture ? 0 : state.accumulatedDeltaX;
  const locked = isNewGesture ? false : state.locked;

  const isHorizontalEvent = Math.abs(input.deltaX) > Math.abs(input.deltaY);
  const clampedDeltaX = Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, input.deltaX));
  const nextAccumulatedDeltaX = locked
    ? accumulatedDeltaX
    : isHorizontalEvent
      ? accumulatedDeltaX + clampedDeltaX
      : 0;

  if (locked || Math.abs(nextAccumulatedDeltaX) < FIRE_THRESHOLD) {
    return {
      state: {
        lastEventAt: input.timestamp,
        accumulatedDeltaX: nextAccumulatedDeltaX,
        locked,
      },
      fire: null,
    };
  }

  // ponytail: locks for the rest of the gesture (until the 250ms idle gap),
  // so a second real swipe right after the first can get swallowed if macOS
  // momentum scrolling keeps the same gesture alive. Upgrade path is tracking
  // delta decay instead of a hard gap to detect the gesture boundary.
  return {
    state: {
      lastEventAt: input.timestamp,
      accumulatedDeltaX: nextAccumulatedDeltaX,
      locked: true,
    },
    fire: nextAccumulatedDeltaX > 0 ? "next" : "previous",
  };
}
