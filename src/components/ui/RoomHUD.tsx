"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Room } from "@/types/room";
import { useExperience } from "@/lib/store";
import { ROOMS } from "@/lib/rooms";

export default function RoomHUD({ room }: { room: Room }) {
  const nextRoom = useExperience((s) => s.nextRoom);
  const prevRoom = useExperience((s) => s.prevRoom);
  const goToRoom = useExperience((s) => s.goToRoom);
  const isPlaying = useExperience((s) => s.isPlaying);
  const setIsPlaying = useExperience((s) => s.setIsPlaying);
  const volume = useExperience((s) => s.volume);
  const setVolume = useExperience((s) => s.setVolume);
  const roomIndex = useExperience((s) => s.roomIndex);
  const hasMultipleRooms = ROOMS.length > 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-10">
      {/* top: room title */}
      <div className="flex items-start justify-between">
        <AnimatePresence mode="wait">
          <motion.div
            key={room.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              {room.subtitle}
            </p>
            <h1
              className="mt-1 text-xl font-light uppercase tracking-[0.2em]"
              style={{ color: room.palette.accent }}
            >
              {room.title}
            </h1>
          </motion.div>
        </AnimatePresence>

        {hasMultipleRooms && (
          <div className="pointer-events-auto flex gap-1.5">
            {ROOMS.map((r, i) => (
              <button
                key={r.id}
                onClick={() => goToRoom(i)}
                aria-label={`Go to ${r.title}`}
                className="h-1.5 w-6 rounded-full transition-all"
                style={{
                  backgroundColor:
                    i === roomIndex ? room.palette.accent : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* bottom: transport controls */}
      <div className="pointer-events-auto flex items-center justify-between gap-4">
        {hasMultipleRooms ? (
          <button
            onClick={prevRoom}
            className="text-xs uppercase tracking-[0.25em] text-white/50 transition hover:text-white"
          >
            ← Prev room
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-white/70 hover:text-white"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❙❙" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-white/80"
            aria-label="Volume"
          />
        </div>

        {hasMultipleRooms ? (
          <button
            onClick={nextRoom}
            className="text-xs uppercase tracking-[0.25em] text-white/50 transition hover:text-white"
          >
            Next room →
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
