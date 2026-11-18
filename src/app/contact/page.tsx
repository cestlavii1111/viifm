"use client";

import { motion } from "framer-motion";
import SiteNav from "@/components/ui/SiteNav";

// Static contact info only — no form, no backend. The entries below are
// placeholders until the real email/socials are swapped in; "..." is used
// instead of a href so nothing is accidentally clickable or indexed before
// then.
const CONTACTS = [
  { label: "Email", value: "..." },
  { label: "Instagram", value: "..." },
];

export default function ContactPage() {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center bg-black px-6 py-24 text-white">
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
        className="font-headline mb-12 text-2xl text-white/90"
      >
        contact
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="flex flex-col items-center gap-4"
      >
        {CONTACTS.map((c) => (
          <div key={c.label} className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/30">
              {c.label}
            </span>
            <span className="font-headline text-sm text-white/70">{c.value}</span>
          </div>
        ))}
      </motion.div>
    </main>
  );
}
