"use client";

import { useEffect } from "react";

/**
 * Mobile Safari's own address bar/toolbar only shrinks in response to an
 * actual scroll gesture on the page — there's no meta tag or CSS that can
 * ask it to collapse. A page that exactly fills the viewport (100dvh) has
 * nothing to scroll into, so on a plain visit Safari just leaves its full
 * chrome sitting there permanently, above and below the room, which reads
 * as letterboxing even though the canvas underneath is already rendering
 * edge-to-edge. globals.css makes the document one pixel taller than the
 * viewport so there's *something* to scroll into; this hook does the
 * actual (invisible, 1px) scroll for the visitor, which is what triggers
 * Safari to collapse its bars. Re-run on load, on the next tick (some
 * versions of Safari ignore a nudge that happens before layout settles),
 * on orientation change, and on pageshow (returning via the
 * back/forward cache skips a fresh mount) — a resize or rotation resets
 * Safari's chrome back to fully expanded, so the nudge has to repeat
 * rather than only ever firing once.
 */
export function useHideMobileChrome() {
  useEffect(() => {
    const nudge = () => window.scrollTo(0, 1);

    nudge();
    const raf = requestAnimationFrame(nudge);
    const timer = window.setTimeout(nudge, 300);

    window.addEventListener("orientationchange", nudge);
    window.addEventListener("resize", nudge);
    window.addEventListener("pageshow", nudge);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("orientationchange", nudge);
      window.removeEventListener("resize", nudge);
      window.removeEventListener("pageshow", nudge);
    };
  }, []);
}
