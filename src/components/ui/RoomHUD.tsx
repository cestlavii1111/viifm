"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Room } from "@/types/room";
import { useExperience } from "@/lib/store";
import { ROOMS } from "@/lib/rooms";
import { TRACKS } from "@/lib/tracks";
import { useFullscreen } from "@/lib/use-fullscreen";

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
  const prevTrack = useExperience((s) => s.prevTrack);
  const isIdle = useExperience((s) => s.isIdle);
  const hasMultipleRooms = ROOMS.length > 1;
  const track = TRACKS[trackIndex];
  const { isFullscreen, isSupported: fullscreenSupported, toggle: toggleFullscreen } =
    useFullscreen();

  // Same fade timing/curves as the audio nav below (see its comment) —
  // one shared idea for all of this "minimal chrome" UI: fade out slowly
  // and stay visible almost the whole way through so it disappears in
  // step with the cursor, fade back in quickly once something moves.
  const idleFadeClass = isIdle
    ? "duration-[2000ms] ease-[cubic-bezier(0.7,0,0.85,0)] pointer-events-none opacity-0"
    : "duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-auto opacity-100";

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
            <p className="font-headline text-[10px] uppercase tracking-[0.3em] text-white/40">
              {room.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-3">
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

          {/* Fullscreen toggle — deliberately small and low-contrast so it
              reads as a corner affordance rather than a headline control,
              and fades with the rest of the idle chrome (see idleFadeClass
              above) rather than sitting there permanently. Skipped
              entirely on browsers with no Fullscreen API for arbitrary
              elements (iPhone Safari, notably) rather than shown as a
              button that would just silently do nothing there. */}
          {fullscreenSupported && (
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              // pointer-events-auto here (rather than relying only on the
              // one idleFadeClass already contributes) matches the
              // room-dots button above, which gets it from its own
              // wrapper — this one doesn't share that wrapper, so it needs
              // it directly instead of leaning on the parent chain.
              // NOTE: no will-change-opacity here — see the nav pill's
              // comment below for why that was removed.
              className={`pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/50 transition-[opacity,color,border-color] hover:border-white/50 hover:text-white ${idleFadeClass}`}
            >
              {isFullscreen ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* bottom: transport controls. The nav pill is centered by a
          justify-between trick: with nothing else in this row, the two
          flanking <span />s are both genuinely 0-width, so space-between
          puts equal space on either side of the pill between them —
          mathematically centering it regardless of the pill's own width.
          That trick breaks the moment this row also has a `gap` set,
          though: `gap` acts as a *minimum* spacing the browser must
          reserve between every pair of children in addition to whatever
          justify-content computes, and once the pill (which resizes with
          the track title — see its own comment below) grows close to
          this row's available width, that reserved minimum no longer
          fits and the layout overflows — which shows up as the "centered"
          pill actually sitting a few pixels off-center once a longer
          title makes it wide enough, worst on mobile's narrower row.
          There's deliberately no `gap` here for that reason; the
          "Prev/Next room" buttons below carry their own margin instead,
          for whenever a second room brings them back. */}
      <div className="pointer-events-auto flex items-center justify-between">
        {hasMultipleRooms ? (
          <button
            onClick={prevRoom}
            className="mr-4 text-xs uppercase tracking-[0.25em] text-white/50 transition hover:text-white"
          >
            ← Prev room
          </button>
        ) : (
          <span />
        )}

        {/* Little audio player nav: song name, play/pause, and arrows to
            step to the previous/next track in the playlist (TRACKS in
            src/lib/tracks.ts) — independent of which visual room is up.
            Fades out along with the cursor after a few seconds of no
            pointer/keyboard activity (isIdle, from useIdleTracker) so it
            doesn't sit on screen during a quiet moment in the room, and
            fades right back in the instant the visitor moves again.
            Fade-out is slow (2s) while fade-in is quicker (1s) since
            reappearing should feel responsive. Opacity only — a scale/lift
            was tried here too, but Tailwind's transform utilities drive
            translate/scale through CSS custom properties, and those don't
            reliably interpolate across a class swap the way a direct
            `opacity` transition does: instead of easing, the transform
            snapped to its end value almost immediately and then just sat
            there for the rest of the duration, reading as a sharp "pop
            down to a smaller size" followed by a lingering pause before
            the (correctly-eased) opacity fade actually caught up. Plain
            opacity has no such snap, so that's all this animates now.
            The cursor hides via a hard, instantaneous switch exactly
            IDLE_FADE_OUT_MS after idle starts (CSS can't transition
            cursor: none), timed to land the moment this fade finishes —
            see the effect in Experience.tsx. That only lines up if the nav
            still LOOKS present for most of the fade: a decelerating curve
            (fast start, slow finish — e.g. a plain ease-out) drops most of
            its opacity in the first two-thirds of the duration and spends
            the rest crawling through values too faint to see, so the nav
            read as already gone a good half-second before the cursor
            actually vanished. An accelerating curve (ease-in) does the
            opposite — stays visibly present almost the whole way through,
            drops right at the end — which is what keeps the two in sync.
            Fade-in keeps a decelerating curve, which suits appearing (snap
            in, settle gently) rather than disappearing. */}
        <motion.div
          // NOTE: this used to also carry `will-change-opacity`, added on
          // a theory that forcing this semi-transparent (bg-black/60)
          // panel onto its own compositor layer would prevent a "stuck
          // visible" repaint bug above the WebGL canvas. In practice it
          // caused a different, worse artifact on desktop: the panel would
          // flash from semi-transparent to fully solid black and back
          // before settling, because promoting a translucent element to
          // its own GPU layer can make some desktop GPU/compositor
          // combinations composite its alpha incorrectly mid-transition.
          // That never showed up on mobile, which pointed straight at
          // will-change as the cause. Removed — a plain opacity
          // transition with no forced layer promotion is what's reliable
          // on both desktop and mobile here.
          //
          // `layout` makes this pill itself animate smoothly whenever its
          // measured width changes — which now happens on every track
          // change, since the title text below varies a lot in length
          // ("Kimpton" vs "Frog Family — Snarez") and the pill sizes to
          // its content rather than having a fixed width. Without this,
          // the width change is instant on the same render the new text
          // commits, reading as a snap/pop; framer-motion instead
          // captures the pill's box before and after that layout shift
          // and eases between them with a transform, so it grows/shrinks
          // gradually. The parent row centers this pill via a
          // justify-between/empty-span trick (see below it and above it),
          // which keeps recentering it correctly at every point along
          // that same eased resize — on both mobile and desktop, since
          // it's the same flex layout at both sizes, just with a narrower
          // text max-width on mobile (see the truncate span below).
          layout
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`flex items-center gap-3 rounded-full border border-white/15 bg-black/60 px-3 py-2 transition-opacity ${idleFadeClass}`}
        >
          {TRACKS.length > 1 && (
            <button
              onClick={prevTrack}
              aria-label="Previous track"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-base text-white/50 transition hover:text-white"
            >
              ←
            </button>
          )}

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-white/70 hover:text-white"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❙❙" : "▶"}
          </button>

          {/* popLayout (not the default "wait") — with "wait" the old title
              fully exits before the new one mounts, which for a moment
              leaves the pill with no title text in the flex flow at all,
              so it would visibly shrink and then grow again instead of
              transitioning in one smooth motion between the two widths.
              popLayout takes the exiting element out of flow (position:
              absolute) immediately so the incoming title's width is what
              the pill's own `layout` animation above eases toward, start
              to finish. */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={track?.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              // Mobile's cap was 9rem (144px) — wide enough that, combined
              // with the prev/play/next buttons and volume slider that all
              // share this same pill, a fully-truncated long title (most
              // of the playlist, once titles include an artist name) made
              // the whole pill wider than the phone's available width
              // (viewport minus this HUD's own side padding). An
              // over-wide pill can't be centered — it just overflows one
              // side — so this had to come down to something that leaves
              // real margin even at that longest, fully-truncated width.
              className="font-headline max-w-[5.5rem] truncate text-[11px] uppercase tracking-[0.15em] text-white/70 sm:max-w-[16rem]"
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
            // html/body now set touch-action: none globally (see
            // globals.css — that's what stops a stray finger-drag from
            // ever triggering a page scroll on mobile), which would
            // otherwise also block a touch drag on this slider's thumb.
            // touch-auto opts this one control back in to its normal
            // touch behavior.
            className="w-14 shrink-0 touch-auto accent-white/80 sm:w-20"
            aria-label="Volume"
          />
        </motion.div>

        {hasMultipleRooms ? (
          <button
            onClick={nextRoom}
            className="ml-4 text-xs uppercase tracking-[0.25em] text-white/50 transition hover:text-white"
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
