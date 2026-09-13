"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useExperience } from "@/lib/store";
import { ROOMS } from "@/lib/rooms";
import { TRACKS } from "@/lib/tracks";
import { useAudioEngine } from "@/lib/audio-engine";
import { useIdleTracker } from "@/lib/use-idle-tracker";
import Landing from "@/components/ui/Landing";
import RoomHUD from "@/components/ui/RoomHUD";
import RoomCanvas from "@/components/RoomCanvas";

export default function Experience() {
  const hasEntered = useExperience((s) => s.hasEntered);
  const roomIndex = useExperience((s) => s.roomIndex);
  const trackIndex = useExperience((s) => s.trackIndex);
  const isPlaying = useExperience((s) => s.isPlaying);
  const volume = useExperience((s) => s.volume);
  const isIdle = useExperience((s) => s.isIdle);

  const room = ROOMS[roomIndex];
  const track = TRACKS[trackIndex];
  // Always call the hook (even pre-entry) so the audio graph is ready the
  // instant the visitor clicks "Enter" — isPlaying stays false until then.
  const { analyser } = useAudioEngine(track?.src, hasEntered && isPlaying, volume);
  // Only watch for idleness once the visitor is actually inside the room —
  // no reason to hide the cursor over the landing gate.
  useIdleTracker(hasEntered);

  return (
    <main
      className={`relative h-dvh w-full overflow-hidden bg-black text-white ${
        hasEntered && isIdle ? "cursor-none" : ""
      }`}
    >

      <AnimatePresence mode="wait">
        {hasEntered && (
          <motion.div
            key={room.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          >
            <RoomCanvas room={room} analyser={analyser} />
            <RoomHUD room={room} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{!hasEntered && <Landing />}</AnimatePresence>
    </main>
  );
}
