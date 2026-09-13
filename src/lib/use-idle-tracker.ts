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
    // back up for no reason the visitor actually did anything.
    //
    // Two earlier attempts at filtering this out still weren't enough on
    // a real desktop mouse/trackpad (only ever confirmed working against
    // a scripted test that never moves the pointer at all): first
    // filtering on PointerEvent.movementX/Y being exactly zero (too
    // strict — some browsers/devices never report an exact zero even for
    // a synthetic event), then requiring a few pixels of travel *between
    // consecutive events*. That per-event delta approach has its own
    // flaw: it only updates its reference point on a move that clears the
    // threshold, so a real hand's constant sub-threshold micro-tremor
    // (a resting mouse or trackpad is never perfectly still) can drift the
    // cursor past the threshold *relative to that stale reference* even
    // though no single event looked like real movement — which reads as
    // exactly the reported bug: works in a scripted test with a truly
    // motionless pointer, but "never fades" for an actual person whose
    // hand is never perfectly still.
    //
    // This instead samples the pointer's position on a fixed interval
    // (independent of how many raw events fired in between) and compares
    // it to where it was at the *previous sample* — updating that
    // reference every single sample regardless of whether this one
    // counted as activity. Slow accumulated drift can no longer sneak
    // past a stale reference the way it could above, since the reference
    // itself moves every interval; only a real, sustained motion covers
    // enough ground within one interval to register.
    const SAMPLE_MS = 150;
    const MOVE_THRESHOLD_PX = 14;
    const WHEEL_THRESHOLD = 6;
    let lastPointerX: number | null = null;
    let lastPointerY: number | null = null;
    let sampleOriginX: number | null = null;
    let sampleOriginY: number | null = null;
    let wheelAccum = 0;

    const onPointerMove = (e: PointerEvent) => {
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      wheelAccum += Math.abs(e.deltaX) + Math.abs(e.deltaY);
    };

    const sample = window.setInterval(() => {
      if (lastPointerX !== null && lastPointerY !== null) {
        if (sampleOriginX === null || sampleOriginY === null) {
          sampleOriginX = lastPointerX;
          sampleOriginY = lastPointerY;
        } else {
          const dx = lastPointerX - sampleOriginX;
          const dy = lastPointerY - sampleOriginY;
          if (dx * dx + dy * dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
            markActive();
          }
          sampleOriginX = lastPointerX;
          sampleOriginY = lastPointerY;
        }
      }
      if (wheelAccum >= WHEEL_THRESHOLD) {
        markActive();
      }
      wheelAccum = 0;
    }, SAMPLE_MS);

    markActive();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("wheel", onWheel);
      events.forEach((event) => window.removeEventListener(event, markActive));
      window.clearInterval(sample);
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, timeoutMs, setIdle]);
}
