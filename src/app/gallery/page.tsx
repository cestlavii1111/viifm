"use client";

import { motion } from "framer-motion";
import SiteNav from "@/components/ui/SiteNav";

// Placeholder grid only — real stills/videos from the rooms and other
// mixed-media work land here later, each slot swapped for an actual
// <img>/<video>. The count (9) is arbitrary, just enough to show the grid
// reads properly at a few different row counts before real content exists.
const PLACEHOLDER_COUNT = 9;

export default function GalleryPage() {
  return (
    <main className="relative min-h-dvh w-full bg-black px-6 py-24 text-white sm:px-10">
      <SiteNav />

      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.5em" }}
        animate={{ opacity: 1, letterSpacing: "0.35em" }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="font-headline mb-3 text-center text-xs uppercase text-white/50"
      >
        vii.fm
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        className="font-headline mb-16 text-center text-2xl text-white/90"
      >
        gallery
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
          >
            <span className="font-headline text-[10px] uppercase tracking-[0.2em] text-white/20">
              coming soon
            </span>
          </div>
        ))}
      </motion.div>
    </main>
  );
}
