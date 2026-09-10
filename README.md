# vii.fm — a cinema for your ears

An audio-visual installation space. Right now: one room — a cube you stand
at the edge of, looking inward. The five walls you can see act as soft
light panels that breathe gently in time with the music, each with its own
color and its own relationship to the sound, but pulsing on one shared
rhythm so the room reads as one calm, trance-like space rather than five
separate things doing their own thing. Built with Next.js, react-three-fiber
(Three.js/WebGL), the Web Audio API, and Framer Motion.

## Running it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Enter** — browsers require a user
gesture before audio can play, so the landing screen is what unlocks sound.

## How the room works

- `src/components/scenes/CubeRoom.tsx` — the room itself. Five walls (the
  wall behind the visitor is left unrendered — that's where you're
  standing); each is a dark frame with a glowing inset panel. Every frame:
  - a **shared envelope** (smoothed overall loudness + a slow independent
    "breathing" cycle) drives the base pulse all walls follow, so they
    stay in rhythm with each other and with the music even when it's quiet.
  - each wall also leans on its own frequency band (see the `WALL` configs
    at the top of the file — back wall tracks the mids, side walls track
    treble with opposite phase for a little shimmer, the floor tracks bass,
    the ceiling drifts on overall loudness) blended in at its own
    `variance`, so the room feels individually alive on top of the shared
    pulse rather than uniform.
  - color is HSL-based with a capped, gentle saturation/lightness range
    (see `saturation`/`lightness` math in the file) so intensity reads as
    "brighter, still soft" rather than ever going neon or strobing — turn
    those ranges up if you want more punch.
  - a slow global hue drift keeps the palette evolving over a long
    timescale rather than being static.
- `src/lib/audio-engine.ts` — the audio graph. If the room has an
  `audioSrc`, that file plays; if not, a generative ambient pad (detuned
  oscillators through a slow filter sweep) fills in, so the room is
  audio-reactive even before you have a final track.
- `src/lib/rooms.ts` — the room's config: title, base wall colors
  (`palette.primary` = back wall, `secondary` = side walls, `accent` =
  ceiling/floor), and which audio file to use.
- `src/lib/store.ts` — global state (play/pause, volume, pointer position)
  via zustand.

### Using a real track

Drop an audio file in `public/audio/` and point `audioSrc` at it in the
single room entry in `src/lib/rooms.ts`:

```ts
{
  id: "the-room",
  title: "THE ROOM",
  audioSrc: "/audio/your-track.mp3", // omit to keep the synth pad
  scene: "cube-room",
  palette: { bg: "#050507", primary: "#7fb8c9", secondary: "#c9a8d6", accent: "#f2e9dc" },
}
```

### Tuning the room's feel

Everything about how "trance-like" this feels lives in
`src/components/scenes/CubeRoom.tsx`:

- **Pulse speed / smoothing** — `Math.min(1, delta * 1.2)` (shared
  envelope) and `Math.min(1, delta * 1.6)` (per-wall) control how quickly
  each wall's glow catches up to the music. Lower = slower, more languid;
  higher = snappier, closer to the actual beat.
- **Breathing cycle** — `Math.sin(t * 0.35)` is the room's own idle tempo
  when the audio is quiet. Change `0.35` to speed up or slow down the
  ambient "breathing."
- **Color range** — `saturation`/`lightness` formulas near the bottom of
  the `useFrame` loop cap how far a wall can brighten/saturate. Nudge the
  base numbers or multipliers to make the room punchier or even calmer.
- **Which wall listens to what** — the `walls` array in the component
  (`band: "bass" | "mid" | "treble" | "overall"` and `variance`) is the
  "individually controlled" part — reassign bands or change variance to
  rebalance which wall reacts to what, and by how much.

### A second room later

The room-program structure (`src/lib/rooms.ts` + `SCENES` in the same
file) still supports more than one room/scene — an older exploratory scene
(`VoidClub`, a particle-field club space) is still in the codebase as a
reference if you want to compare visual languages, but isn't wired into the
program right now. To add a second room later: add an entry to the `ROOMS`
array and, if it should look different from the cube, a new scene component
registered in `SCENES` — the multi-room navigation UI (dots, prev/next) in
`RoomHUD.tsx` automatically reappears once `ROOMS.length > 1`.

## Deploying to Vercel

This is a stock Next.js (App Router) project — no special config needed.

```bash
git add -A
git commit -m "Initial vii.fm build"
git remote add origin <your-github-repo-url>   # if not already set
git push -u origin main
```

Then in Vercel: **New Project → Import** your GitHub repo, framework preset
auto-detects as Next.js, and deploy.

## Notes / next steps to consider

- The room ships with **no real audio file** — it plays the generative pad
  until you add a track to `public/audio/`.
- Large audio files increase deploy size; for a big file, consider hosting
  audio externally (an object store/CDN) and pointing `audioSrc` at a full
  URL instead of a local path.
- Mobile: works, but Web Audio autoplay rules and touch-vs-pointer
  head-turn are worth a dedicated pass before launch.
- The "look around" effect is a subtle camera rotation tied to pointer
  position — it's intentionally gentle (you're standing still, just
  turning your head). Widen the multipliers in `CubeRoom.tsx`'s `useFrame`
  if you want visitors to be able to look further left/right/up/down.
