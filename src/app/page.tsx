"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import SiteNav from "@/components/ui/SiteNav";

// The site's three "rooms", in the order they're presented here. Kept as
// plain data (rather than reusing PAGES from SiteNav) since this list wants
// its own copy/description per entry and deliberately excludes "Home"
// itself.
const DESTINATIONS = [
  {
    href: "/listening-room",
    label: "Listening Room",
    description: "An audio-visual installation — an evolving soundscape you steer by looking around.",
  },
  {
    href: "/gallery",
    label: "Gallery",
    description: "Stills and fragments from the rooms, and from everything mixed-media in between.",
  },
  {
    href: "/contact",
    label: "Contact",
    description: "Where to find me.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-black px-6 py-24 text-white">
      <SiteNav />

      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.5em" }}
        animate={{ opacity: 1, letterSpacing: "0.35em" }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="font-headline mb-3 text-xs uppercase text-white/50"
      >
        vii.fm
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        className="font-headline mb-16 max-w-lg text-center text-2xl text-white/90"
      >
        a digital garden
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="grid w-full max-w-3xl gap-4 sm:grid-cols-3"
      >
        {DESTINATIONS.map((d, i) => (
          <motion.div
            key={d.href}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 + i * 0.1 }}
          >
            <Link
              href={d.href}
              className="group flex h-full flex-col rounded-2xl border border-white/15 p-6 transition hover:border-white/50"
            >
              <span className="font-headline mb-3 text-xs uppercase tracking-[0.25em] text-white/80 transition group-hover:text-white">
                {d.label}
              </span>
              <span className="text-xs leading-relaxed text-white/40 transition group-hover:text-white/60">
                {d.description}
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.1 }}
        className="mt-16 text-[10px] uppercase tracking-widest text-white/30"
      >
        best experienced with sound on
      </motion.p>
    </main>
  );
}
