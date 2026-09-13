"use client";

import { useCallback, useEffect, useState } from "react";

// Safari (desktop and iPadOS) still ships the Fullscreen API behind its
// old webkit-prefixed names rather than the standard document.fullscreen*
// ones — this narrow type just describes the handful of prefixed members
// this hook actually touches, on top of the standard lib.dom types.
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  webkitFullscreenEnabled?: boolean;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

function getFullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * True fullscreen (hiding the browser chrome entirely, not just the
 * letterboxing/toolbar work done elsewhere) via the browser's own
 * Fullscreen API. Requested on the whole page (document.documentElement)
 * rather than any one component's element, since the toggle should take
 * over the entire experience regardless of which piece of UI it lives in.
 *
 * iPhone Safari is the one mainstream browser with no support for this API
 * at all on arbitrary elements (only iPadOS and desktop Safari implement
 * even the webkit-prefixed version) — isSupported reflects that so the
 * button can hide itself there rather than sit around doing nothing.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const doc = document as WebkitDocument;
    setIsSupported(Boolean(document.fullscreenEnabled ?? doc.webkitFullscreenEnabled));

    const onChange = () => setIsFullscreen(getFullscreenElement() !== null);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as WebkitDocument;
    if (getFullscreenElement()) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else doc.webkitExitFullscreen?.();
      return;
    }
    const el = document.documentElement as WebkitElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  }, []);

  return { isFullscreen, isSupported, toggle };
}
