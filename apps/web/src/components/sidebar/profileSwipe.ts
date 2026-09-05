/**
 * Browser fallback for clients without Electron's scroll gesture boundaries.
 * Horizontal motion accumulates until a switch fires. Momentum is ignored
 * until meaningful motion pauses between gestures.
 */

const GESTURE_IDLE_MS = 140;
const FIRE_THRESHOLD = 110;
// One Shift+wheel notch can report a single deltaX of 100+, well past
// FIRE_THRESHOLD by itself. Clamp each event's contribution so a swipe
// still takes more than two large events to fire.
const MAX_EVENT_DELTA = 40;
const DIRECTION_NOISE_PX = 8;

export interface ProfileSwipeState {
  lastMotionAt: number | null;
  accumulatedDeltaX: number;
  locked: boolean;
}

export const INITIAL_PROFILE_SWIPE_STATE: ProfileSwipeState = {
  lastMotionAt: null,
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
  const absX = Math.abs(input.deltaX);
  const absY = Math.abs(input.deltaY);
  const isHorizontalEvent = absX > absY;
  // Ignore a faint momentum tail when measuring the gap, but only a
  // meaningful horizontal event can unlock the next swipe. Tiny events
  // alone must never rearm and accumulate into an accidental switch.
  const meaningfulMotion = Math.max(absX, absY) >= DIRECTION_NOISE_PX;
  const isNewGesture =
    state.lastMotionAt === null ||
    (input.timestamp - state.lastMotionAt >= GESTURE_IDLE_MS &&
      (!state.locked || (isHorizontalEvent && meaningfulMotion)));
  const accumulatedDeltaX = isNewGesture ? 0 : state.accumulatedDeltaX;
  const locked = isNewGesture ? false : state.locked;

  const clampedDeltaX = Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, input.deltaX));
  const nextAccumulatedDeltaX = locked
    ? accumulatedDeltaX
    : isHorizontalEvent
      ? accumulatedDeltaX + clampedDeltaX
      : absY >= DIRECTION_NOISE_PX
        ? 0
        : accumulatedDeltaX;

  if (locked || Math.abs(nextAccumulatedDeltaX) < FIRE_THRESHOLD) {
    return {
      state: {
        lastMotionAt: locked && !meaningfulMotion ? state.lastMotionAt : input.timestamp,
        accumulatedDeltaX: nextAccumulatedDeltaX,
        locked,
      },
      fire: null,
    };
  }

  return {
    state: {
      lastMotionAt: input.timestamp,
      accumulatedDeltaX: nextAccumulatedDeltaX,
      locked: true,
    },
    fire: nextAccumulatedDeltaX > 0 ? "next" : "previous",
  };
}

export interface NativeProfileSwipeState {
  active: boolean;
  axis: "x" | "y" | null;
  x: number;
  y: number;
  fired: boolean;
}

export const INITIAL_NATIVE_PROFILE_SWIPE_STATE: NativeProfileSwipeState = {
  active: false,
  axis: null,
  x: 0,
  y: 0,
  fired: false,
};

/** One switch per Electron gesture, immediately rearmed by the next begin event. */
export function reduceNativeProfileSwipe(
  state: NativeProfileSwipeState,
  input: { type: "begin" | "end" } | { type: "wheel"; deltaX: number; deltaY: number },
): { state: NativeProfileSwipeState; fire: "next" | "previous" | null } {
  if (input.type === "begin") {
    return { state: { ...INITIAL_NATIVE_PROFILE_SWIPE_STATE, active: true }, fire: null };
  }
  if (input.type === "end") {
    return { state: { ...state, active: false }, fire: null };
  }
  if (input.type !== "wheel" || !state.active || state.fired) return { state, fire: null };

  const x = state.x + input.deltaX;
  const y = state.y + input.deltaY;
  const axis =
    state.axis ??
    (Math.max(Math.abs(x), Math.abs(y)) < 12 ? null : Math.abs(x) > Math.abs(y) * 1.3 ? "x" : "y");
  const fire = axis === "x" && Math.abs(x) >= FIRE_THRESHOLD ? (x > 0 ? "next" : "previous") : null;
  return { state: { ...state, x, y, axis, fired: fire !== null }, fire };
}
