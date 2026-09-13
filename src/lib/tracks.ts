export interface Track {
  id: string;
  /** Displayed as the song name in the player nav */
  title: string;
  /** Optional — shown alongside the title as "ARTIST — TITLE" */
  artist?: string;
  /** Path under /public pointing to an audio file, e.g. "/audio/set-01.mp3" */
  src: string;
}

/**
 * The room's playlist. The player nav (see TrackPlayer.tsx) cycles through
 * these independently of which visual room is active — right now there's
 * only one room, but the tracks aren't tied to it, so more can be added
 * here without touching the visuals at all.
 */
export const TRACKS: Track[] = [
  { id: "kimpton", title: "Kimpton", src: "/audio/kimpton.mp3" },
  {
    id: "too-much-money",
    title: "Too Much Money",
    artist: "Automatic",
    src: "/audio/automatic-too-much-money.mp3",
  },
];
