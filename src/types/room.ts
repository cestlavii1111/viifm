export type SceneKey = "void-club" | "cube-room";

export interface RoomPalette {
  /** Base background color of the space */
  bg: string;
  /** Primary light/particle color */
  primary: string;
  /** Secondary accent color for rim light / fog */
  secondary: string;
  /** UI accent (titles, cursor, controls) */
  accent: string;
}

export interface Room {
  id: string;
  /** Displayed as the "now performing" title */
  title: string;
  /** Small subtitle / set description */
  subtitle?: string;
  /**
   * Path under /public pointing to an audio file, e.g. "/audio/set-01.mp3".
   * Leave undefined to fall back to the built-in ambient synth pad —
   * useful for staging a room before you have a final track.
   */
  audioSrc?: string;
  /** Which visual scene component renders this room */
  scene: SceneKey;
  palette: RoomPalette;
}

/**
 * To add a new room/performance:
 *   1. Drop an audio file in /public/audio (optional — omit audioSrc to use the synth pad)
 *   2. Add an entry to ROOMS in src/lib/rooms.ts
 *   3. If you want a new visual language rather than reusing "void-club",
 *      create src/components/scenes/YourScene.tsx and register it in
 *      SCENES in src/lib/rooms.ts
 */
