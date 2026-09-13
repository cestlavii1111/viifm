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
  /** Which visual scene component renders this room */
  scene: SceneKey;
  palette: RoomPalette;
}

/**
 * To add a new room/performance:
 *   1. Add an entry to ROOMS in src/lib/rooms.ts
 *   2. If you want a new visual language rather than reusing "void-club",
 *      create src/components/scenes/YourScene.tsx and register it in
 *      SCENES in src/lib/rooms.ts
 *
 * To add a new track to the playlist (independent of rooms):
 *   1. Drop an audio file in /public/audio
 *   2. Add an entry to TRACKS in src/lib/tracks.ts
 */
