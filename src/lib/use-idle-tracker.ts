"use client";

import { useEffect } from "react";
import { useExperience } from "@/lib/store";

/** How long the pointer/keyboard can sit still before things fade away. */
export const IDLE_TIMEOUT_MS = 3000;
/** How long the cursor/nav take to fade out once idle — slow and eased,
 *  not a hard cut. */
export const IDLE_FADE_OUT_MS = 2000;
/** How long they take to fade back in on the next move — snappier than
 *  the fade-out, since reappearing should feel responsive. */
export const IDLE_FADE_IN_MS = 1000;

/**
 * Watches for pointer/keyboard/touch activity anywhere on the page and
 * flips the shared `isIdle` flag on after a few seconds of silence,
 * clearing it the instant something moves again. Mount once (Experience
 * does this, gated to hasEntered) — consumers just read `isIdle` from the
 * store rather than each running their own listeners.
 */
export function useIdleTracker(enabled: boolean, timeoutMs = IDLE_TIMEOUT_MS) {
  const setIdle = useExperience((s) => s.setIdle);

  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }

    let timer: number | undefined;
    const markActive = () => {
      setIdle(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), timeoutMs);
    };

    // Browsers occasionally dispatch a "pointermove" (or a residual
    // "wheel", from a trackpad's momentum scroll tailing off) with little
    // or no real movement behind it — e.g. Chrome refreshing :hover state
    // whenever the DOM under a stationary pointer changes, which the
    // cursor itself hiding, the room's own layout, or an animating track
    // name all do constantly here. Left unfiltered, any one of those can
    // land after the idle timeout fires and immediately wake everything
    // back up for no reason the visitor actually did anything — which is
    // exactly what "the nav never fades away" turned out to be: a steady
    // trickle of these was resetting the 3s timer before it ever ran out.
    //
    // The previous attempt at this filtered on PointerEvent.movementX/Y
    // being exactly (0, 0), on the assumption a synthetic event reports no
    // movement. That doesn't hold across browsers/devices reliably enough
    // (some report a tiny nonzero value, or handle movementX/Y differently
    // at fractional device pixel ratios) — a filter that only catches the
    // exact-zero case still lets enough of these through to keep the timer
    // alive indefinitely. Tracking real client-coordinate deltas ourselves
    // and requiring a couple of real pixels of travel is the more reliable
    // version of the same idea, independent of any single browser's
    // movementX/Y semantics.
    let lastX: number | null = null;
    let lastY: number | null = null;
    const MIN_MOVE_PX = 3;
    const onPointerMove = (e: PointerEvent) => {
      if (lastX !== null && lastY !== null) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (dx * dx + dy * dy < MIN_MOVE_PX * MIN_MOVE_PX) return;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      markActive();
    };
    // Same idea for wheel: a trackpad's inertial scroll can keep sending
    // events with a vanishingly small (but not always exactly zero) delta
    // for a second or more after a finger actually lifts.
    const MIN_WHEEL_DELTA = 1;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) < MIN_WHEEL_DELTA && Math.abs(e.deltaY) < MIN_WHEEL_DELTA) return;
      markActive();
    };

    markActive();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("wheel", onWheel);
      events.forEach((event) => window.removeEventListener(event, markActive));
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, timeoutMs, setIdle]);
}
