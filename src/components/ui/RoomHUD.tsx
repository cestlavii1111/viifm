"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Room } from "@/types/room";
import { useExperience } from "@/lib/store";
import { ROOMS } from "@/lib/rooms";
import { TRACKS } from "@/lib/tracks";

export default function RoomHUD({ room }: { room: Room }) {
  const nextRoom = useExperience((s) => s.nextRoom);
  const prevRoom = useExperience((s) => s.prevRoom);
  const goToRoom = useExperience((s) => s.goToRoom);
  const isPlaying = useExperience((s) => s.isPlaying);
  const setIsPlaying = useExperience((s) => s.setIsPlaying);
  const volume = useExperience((s) => s.volume);
  const setVolume = useExperience((s) => s.setVolume);
  const roomIndex = useExperience((s) => s.roomIndex);
  const trackIndex = useExperience((s) => s.trackIndex);
  const nextTrack = useExperience((s) => s.nextTrack);
  const isIdle = useExperience((s) => s.isIdle);
  const hasMultipleRooms = ROOMS.length > 1;
  const track = TRACKS[trackIndex];

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

        {/* Little audio player nav: song name, play/pause, and an arrow to
            skip to the next track in the playlist (TRACKS in
            src/lib/tracks.ts) — independent of which visual room is up.
            Fades out along with the cursor after a few seconds of no
            pointer/keyboard activity (isIdle, from useIdleTracker) so it
            doesn't sit on screen during a quiet moment in the room, and
            fades right back in the instant the visitor moves again.
            Fade-out is slow (2s) while fade-in is quicker (1s) since
            reappearing should feel responsive. Both pair opacity with a
            very small scale/lift, since a smooth curve on opacity alone
            still reads as a flat wipe — a touch of motion underneath it is
            what actually sells "settling" in or out.
            The cursor hides via a hard, instantaneous switch exactly
            IDLE_FADE_OUT_MS after idle starts (CSS can't transition
            cursor: none), timed to land the moment this fade finishes —
            see the effect in Experience.tsx. That only lines up if the nav
            still LOOKS present for most of the fade: a decelerating curve
            (fast start, slow finish — e.g. the earlier "standard"
            ease-in-out) drops most of its opacity in the first two-thirds
            of the duration and spends the rest crawling through values too
            faint to see, so the nav read as already gone a good half-
            second before the cursor actually vanished. An accelerating
            curve (ease-in) does the opposite — it stays visibly present
            almost the whole way through and does its drop right at the
            end — which is what actually keeps the two in sync. Fade-in
            keeps a decelerating curve, which suits appearing (snap in,
            settle gently) rather than disappearing. */}
        <div
          className={`flex items-center gap-3 rounded-full border border-white/15 bg-black/60 px-3 py-2 transition-[opacity,transform] ${
            isIdle
              ? "duration-[2000ms] ease-[cubic-bezier(0.7,0,0.85,0)] pointer-events-none opacity-0 translate-y-1 scale-[0.97]"
              : "duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-auto opacity-100 translate-y-0 scale-100"
          }`}
        >
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-white/70 hover:text-white"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❙❙" : "▶"}
          </button>

          <AnimatePresence mode="wait">
            <motion.span
              key={track?.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="max-w-[9rem] truncate text-[11px] uppercase tracking-[0.15em] text-white/70 sm:max-w-[16rem]"
            >
              {track ? (track.artist ? `${track.artist} — ${track.title}` : track.title) : ""}
            </motion.span>
          </AnimatePresence>

          {TRACKS.length > 1 && (
            <button
              onClick={nextTrack}
              aria-label="Next track"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-base text-white/50 transition hover:text-white"
            >
              →
            </button>
          )}

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-14 shrink-0 accent-white/80 sm:w-20"
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
