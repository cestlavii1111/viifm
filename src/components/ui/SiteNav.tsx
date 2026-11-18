"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/listening-room", label: "Listening Room" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

/**
 * The site's one shared navigation affordance: a small, low-contrast
 * button that expands into a short list of the site's pages. Deliberately
 * minimal — this isn't meant to compete with the Listening Room's own
 * visuals or read as a conventional website header, just give a visitor a
 * way to find the other rooms/pages.
 *
 * Two render modes:
 * - `inline` (used by RoomHUD): no positioning of its own — it's meant to
 *   sit as one more icon inside RoomHUD's existing top-right button row,
 *   right next to the fullscreen toggle, so it fades with that row's own
 *   idleFadeClass and never collides with the room title in the opposite
 *   corner.
 * - standalone (default, used by the plain pages): fixed to the top-right
 *   corner on its own, always visible — those pages have no idle chrome
 *   to match and no title sitting in that corner to avoid.
 */
export default function SiteNav({
  fadeClassName,
  inline = false,
}: {
  /** Tailwind classes controlling opacity/pointer-events for idle fading
   *  (see RoomHUD's idleFadeClass). Only meaningful with `inline`. */
  fadeClassName?: string;
  /** Render as a bare inline element for a parent (RoomHUD) to position,
   *  instead of fixed-positioning itself. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={
        inline
          ? `relative ${fadeClassName ?? ""}`
          : "pointer-events-auto fixed right-6 top-6 z-30 sm:right-10 sm:top-10"
      }
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/50 transition-[opacity,color,border-color] hover:border-white/50 hover:text-white"
      >
        {/* Three short bars — a plain, generic "menu" glyph rather than an
            image asset, so it inherits currentColor and needs no extra
            request. Morphs into an X when open via a couple of rotated
            bars collapsing onto the middle one. */}
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
          <line
            x1="4"
            y1={open ? 12 : 7}
            x2="20"
            y2={open ? 12 : 7}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              transformOrigin: "center",
              transform: open ? "rotate(45deg)" : "none",
              transition: "transform 0.2s ease, y 0.2s ease",
            }}
          />
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ opacity: open ? 0 : 1, transition: "opacity 0.15s ease" }}
          />
          <line
            x1="4"
            y1={open ? 12 : 17}
            x2="20"
            y2={open ? 12 : 17}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              transformOrigin: "center",
              transform: open ? "rotate(-45deg)" : "none",
              transition: "transform 0.2s ease, y 0.2s ease",
            }}
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            // Absolutely positioned (rather than a normal-flow sibling of
            // the button) so opening it never pushes or resizes whatever
            // row it's sitting in — crucial for `inline` mode, where that
            // row is RoomHUD's existing top-right icon row shared with the
            // fullscreen toggle. Anchored to the container's right edge in
            // both modes so it lines up under the button either way.
            className="absolute right-0 top-full mt-2 flex w-40 flex-col gap-1 rounded-2xl border border-white/15 bg-black/80 p-2"
          >
            {PAGES.map((page) => {
              const active = pathname === page.href;
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  onClick={() => setOpen(false)}
                  className={`font-headline rounded-lg px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition ${
                    active
                      ? "text-white"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {page.label}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
