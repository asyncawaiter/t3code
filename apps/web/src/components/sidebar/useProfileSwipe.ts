import { useEffect, useEffectEvent, type RefObject } from "react";
import {
  INITIAL_PROFILE_SWIPE_STATE,
  INITIAL_NATIVE_PROFILE_SWIPE_STATE,
  reduceProfileSwipe,
  reduceNativeProfileSwipe,
} from "./profileSwipe";

/** Same one-profile gesture boundaries in the sidebar and floating navigator. */
export function useProfileSwipe(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onSwitch: (direction: "next" | "previous") => void,
) {
  const switchProfile = useEffectEvent(onSwitch);
  const onScrollGesture =
    typeof window === "undefined" ? undefined : window.desktopBridge?.onScrollGesture;
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;

    if (onScrollGesture) {
      let state = INITIAL_NATIVE_PROFILE_SWIPE_STATE;
      let lastWheelInside = false;
      let startedInside = false;
      const reset = () => {
        state = INITIAL_NATIVE_PROFILE_SWIPE_STATE;
        lastWheelInside = startedInside = false;
      };
      const onWheel = (event: WheelEvent) => {
        lastWheelInside =
          event.target instanceof Node && node.contains(event.target) && !event.ctrlKey;
        if (!lastWheelInside || !startedInside) return;
        const result = reduceNativeProfileSwipe(state, {
          type: "wheel",
          deltaX: event.deltaX,
          deltaY: event.deltaY,
        });
        state = result.state;
        if (result.fire) switchProfile(result.fire);
      };
      const unsubscribe = onScrollGesture((phase) => {
        // Chromium sends begin after the first wheel event. Latch its origin
        // so a gesture started in the chat cannot switch profiles on entering the sidebar.
        startedInside = phase === "begin" && lastWheelInside;
        state = reduceNativeProfileSwipe(state, { type: phase }).state;
      });
      // Cancelling wheel events suppresses Chromium's gesture boundaries.
      // CSS contains horizontal overflow; vertical scrolling stays native.
      window.addEventListener("wheel", onWheel, { capture: true, passive: true });
      window.addEventListener("blur", reset);
      return () => {
        unsubscribe();
        window.removeEventListener("wheel", onWheel, { capture: true });
        window.removeEventListener("blur", reset);
      };
    }

    let state = INITIAL_PROFILE_SWIPE_STATE;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const result = reduceProfileSwipe(state, {
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
        timestamp: event.timeStamp,
      });
      state = result.state;
      if (result.fire) switchProfile(result.fire);
    };
    node.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => node.removeEventListener("wheel", onWheel, { capture: true });
  }, [onScrollGesture, enabled, containerRef]);

  return Boolean(onScrollGesture);
}
