"use client";

import { useEffect } from "react";
import { useExperience } from "@/lib/store";

/**
 * Watches for pointer/keyboard/touch activity anywhere on the page and
 * flips the shared `isIdle` flag on after a few seconds of silence,
 * clearing it the instant something moves again. Mount once (Experience
 * does this, gated to hasEntered) — consumers just read `isIdle` from the
 * store rather than each running their own listeners.
 */
export function useIdleTracker(enabled: boolean, timeoutMs = 2000) {
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

    markActive();
    const events: (keyof WindowEventMap)[] = [
      "pointermove",
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, timeoutMs, setIdle]);
}
