"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Room } from "@/types/room";
import { useExperience } from "@/lib/store";
import { ROOMS } from "@/lib/rooms";
import { TRACKS } from "@/lib/tracks";
import { useFullscreen } from "@/lib/use-fullscreen";

// How fast the ticker scrolls once a title is long enough to overflow its
// fixed-width slot, in pixels/second — chosen so a duration falls out of
// each title's own measured width instead of every title (short or long)
// scrolling for the same fixed number of seconds, which would make long
// titles feel rushed and short ones feel sluggish.
const MARQUEE_PIXELS_PER_SECOND = 34;
const MARQUEE_MIN_DURATION_S = 4;
// Gap between the looping copies of the title, in px — also used as the
// tolerance below so a title that's only a hair wider than its slot
// doesn't marquee over what would be an imperceptible clip.
const MARQUEE_GAP_PX = 40;

/**
 * Fixed-width, overflow-hidden slot for the currently playing track's
 * title. Replaces the old max-width + truncate + framer-motion `layout`
 * approach: that grew/shrank the whole pill to fit each title (smoothly,
 * after a later round animated the resize), but the user asked for the
 * pill itself to stop changing size at all and instead have any title
 * that doesn't fit scroll horizontally in place, like a news ticker.
 *
 * A title is measured against its slot on every change (via a hidden,
 * absolutely-positioned copy — invisible but still laid out, so its
 * scrollWidth reflects the real rendered width including this font's
 * letter-spacing). Titles that fit are simply centered and static;
 * titles that don't are rendered twice back-to-back and looped with the
 * marquee-scroll keyframe in globals.css (see that comment for why
 * translateX(-50%) is exactly the right loop point for a doubled row).
 */
function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [marquee, setMarquee] = useState({ overflow: false, duration: MARQUEE_MIN_DURATION_S });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const textWidth = measure.scrollWidth;
    const containerWidth = container.clientWidth;
    const overflow = textWidth > containerWidth;
    const duration = Math.max(textWidth / MARQUEE_PIXELS_PER_SECOND, MARQUEE_MIN_DURATION_S);
    setMarquee({ overflow, duration });
  }, [text]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Invisible measuring copy — always rendered (regardless of which
          branch below is showing) so a track change re-measures against
          this text's real width before deciding whether to marquee it. */}
      <span
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
        aria-hidden="true"
      >
        {text}
      </span>

      {marquee.overflow ? (
        <div
          className="flex h-full w-max items-center whitespace-nowrap"
          style={{ animation: `marquee-scroll ${marquee.duration}s linear infinite` }}
        >
          <span style={{ paddingRight: MARQUEE_GAP_PX }}>{text}</span>
          <span style={{ paddingRight: MARQUEE_GAP_PX }} aria-hidden="true">
            {text}
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="whitespace-nowrap">{text}</span>
        </div>
      )}
    </div>
  );
}

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

  // Desktop: left/right arrow keys step to the previous/next track from
  // anywhere on the page, without needing the pill focused first. Guarded
  // against INPUT/TEXTAREA/SELECT so this doesn't fight the volume
  // <input type="range"> above, whose own native behavior is to nudge its
  // value on ArrowLeft/ArrowRight while it's focused — that should keep
  // working exactly as a plain range input normally does.
  useEffect(() => {
    if (TRACKS.length <= 1) return;
    function onKeyDown(e: KeyboardEvent) {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevTrack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextTrack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prevTrack, nextTrack]);

  // Mobile: swipe left/right anywhere on the pill to step tracks, the
  // touch equivalent of the arrow keys above. Tracked with plain
  // pointerdown/up rather than a gesture library since all this needs is
  // "did the pointer travel far enough, mostly horizontally, between down
  // and up" — e.target.closest("button, input") on pointerdown skips
  // starting a swipe when the press begins on the prev/play/next buttons
  // or the volume slider, so those keep working as plain clicks/drags
  // exactly like before ("Also keep the nav buttons clickable").
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 40;

  function handlePillPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, input")) {
      swipeStart.current = null;
      return;
    }
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handlePillPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || TRACKS.length <= 1) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) {
      nextTrack();
    } else {
      prevTrack();
    }
  }

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
        <div
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
          // This pill USED to carry framer-motion's `layout` prop so it
          // could smoothly grow/shrink to fit each track title. The user
          // asked for the opposite now — a pill that never changes size —
          // so the title itself gets a fixed-width slot (MarqueeText
          // above) and scrolls in place instead of resizing its
          // container. With nothing left that changes this element's own
          // box, plain CSS opacity (via idleFadeClass) is all it needs; no
          // more framer-motion here. The parent row still centers this
          // pill via the justify-between/empty-span trick described above
          // it — trivially satisfied now since the pill's width is
          // constant, not just non-overflowing.
          onPointerDown={handlePillPointerDown}
          onPointerUp={handlePillPointerUp}
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

          {/* Fixed-width slot (never resizes with the track), replacing
              the old truncate+ellipsis span. Mobile's width (5.5rem) and
              desktop's (16rem) are carried over unchanged from the old
              max-width values — those were already tuned so the pill
              stays centered with real margin to spare on a narrow phone
              viewport (see the sizing history that used to live here,
              now in MarqueeText's own comment above). A crossfade between
              tracks is kept via AnimatePresence, but only for a brief
              opacity/position blend on change — MarqueeText itself
              re-measures and restarts its own scroll fresh for whichever
              title mounts. */}
          <div className="h-[14px] w-[5.5rem] sm:w-[16rem]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={track?.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="font-headline h-full text-[11px] uppercase tracking-[0.15em] text-white/70"
              >
                <MarqueeText
                  text={track ? (track.artist ? `${track.artist} — ${track.title}` : track.title) : ""}
                />
              </motion.div>
            </AnimatePresence>
          </div>

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
        </div>

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
