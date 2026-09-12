import type { Room, SceneKey } from "@/types/room";
import VoidClub from "@/components/scenes/VoidClub";
import CubeRoom from "@/components/scenes/CubeRoom";

/**
 * The performance program for the space — one entry per room/stage.
 * Ordered array = the linear journey visitors walk through.
 *
 * Right now there's a single room: a cube you stand at the edge of,
 * looking inward at walls that breathe light with the music.
 */
export const ROOMS: Room[] = [
  {
    id: "the-room",
    title: "THE ROOM",
    subtitle: "vii.fm",
    // Test track — swap for whatever's live in the room.
    audioSrc: "/audio/kimpton.mp3",
    scene: "cube-room",
    palette: {
      bg: "#050507",
      // soft, gentle base tones — walls modulate around these, not neon
      primary: "#7fb8c9", // back wall — pale cyan/teal
      secondary: "#c9a8d6", // side walls — soft lavender
      accent: "#f2e9dc", // UI accent / ceiling & floor warmth
    },
  },
];

/** Maps a Room's `scene` key to the component that renders it. */
export const SCENES: Record<SceneKey, React.ComponentType<{ room: Room }>> = {
  "void-club": VoidClub,
  "cube-room": CubeRoom,
};
