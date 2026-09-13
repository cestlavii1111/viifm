"use client";

import { motion } from "framer-motion";
import { getAudioContext, primeAudioPlayback } from "@/lib/audio-engine";
import { useExperience } from "@/lib/store";
import { TRACKS } from "@/lib/tracks";

export default function Landing() {
  const enter = useExperience((s) => s.enter);
  const trackIndex = useExperience((s) => s.trackIndex);

  const handleEnter = () => {
    // Must happen inside the click handler so browsers allow audio.
    getAudioContext();
    // Resuming the AudioContext above unlocks the synth-pad path, but a
    // real track plays it through an <audio> element, which has its own,
    // separate autoplay gate. Safari revokes that gate the moment this
    // call stack ends, so priming it here — not from the effect that
    // normally starts playback a tick later — is what keeps the track
    // actually playing on Safari (see primeAudioPlayback).
    const track = TRACKS[trackIndex];
    if (track?.src) primeAudioPlayback(track.src);
    enter();
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black text-white"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9 }}
    >
      <motion.p
        initial={{ opacity: 0, letterSpacing: "0.5em" }}
        animate={{ opacity: 1, letterSpacing: "0.35em" }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="mb-3 text-xs uppercase text-white/50"
      >
        vii.fm
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        className="mb-10 max-w-md text-center text-2xl font-light tracking-wide text-white/90"
      >
        cinema for your ears
      </motion.h1>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.7 }}
        onClick={handleEnter}
        className="group relative rounded-full border border-white/25 px-10 py-3 text-sm uppercase tracking-[0.3em] text-white/80 transition hover:border-white/70 hover:text-white"
      >
        Enter
        <span className="pointer-events-none absolute inset-0 rounded-full bg-white/5 opacity-0 transition group-hover:opacity-100" />
      </motion.button>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="mt-6 text-[10px] uppercase tracking-widest text-white/30"
      >
        best experienced with sound on
      </motion.p>
    </motion.div>
  );
}
