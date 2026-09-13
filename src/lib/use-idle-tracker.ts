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

    // Browsers occasionally dispatch a "pointermove" with no actual mouse
    // movement behind it — e.g. Chrome fires one to refresh :hover state
    // whenever the DOM under a stationary pointer changes (which the cursor
    // itself hiding/showing, or the room's own layout shifting, both do
    // constantly here). Without filtering these out, one of those synthetic
    // events could land right after the idle timeout fires and immediately
    // wake things back up — reappearing the cursor and nav for no reason
    // the visitor actually did anything. A real pointermove always carries
    // nonzero movementX/Y; a synthetic hover-refresh one reports (0, 0).
    const onPointerMove = (e: PointerEvent) => {
      if (e.movementX === 0 && e.movementY === 0) return;
      markActive();
    };

    markActive();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      events.forEach((event) => window.removeEventListener(event, markActive));
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, timeoutMs, setIdle]);
}
