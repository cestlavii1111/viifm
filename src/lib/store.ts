import { create } from "zustand";
import { ROOMS } from "@/lib/rooms";
import { TRACKS } from "@/lib/tracks";

interface ExperienceState {
  /** Has the visitor clicked past the landing gate (needed to unlock audio)? */
  hasEntered: boolean;
  enter: () => void;

  roomIndex: number;
  nextRoom: () => void;
  prevRoom: () => void;
  goToRoom: (index: number) => void;

  /** Which track in TRACKS is loaded — independent of roomIndex, so the
   *  playlist can grow without needing a visual room per song. */
  trackIndex: number;
  nextTrack: () => void;

  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  volume: number;
  setVolume: (v: number) => void;

  /** True once the pointer/keyboard has been untouched for a few seconds —
   *  drives fading the OS cursor and the transport nav out of the way. */
  isIdle: boolean;
  setIdle: (idle: boolean) => void;

  /** 0..1 pointer position, updated by the canvas for scenes that want it */
  pointer: { x: number; y: number };
  setPointer: (x: number, y: number) => void;
}

export const useExperience = create<ExperienceState>((set) => ({
  hasEntered: false,
  enter: () => set({ hasEntered: true, isPlaying: true }),

  roomIndex: 0,
  nextRoom: () =>
    set((s) => ({ roomIndex: (s.roomIndex + 1) % ROOMS.length })),
  prevRoom: () =>
    set((s) => ({ roomIndex: (s.roomIndex - 1 + ROOMS.length) % ROOMS.length })),
  goToRoom: (index) => set({ roomIndex: ((index % ROOMS.length) + ROOMS.length) % ROOMS.length }),

  trackIndex: 0,
  nextTrack: () => set((s) => ({ trackIndex: (s.trackIndex + 1) % TRACKS.length })),

  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  volume: 0.7,
  setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),

  isIdle: false,
  setIdle: (idle) => set({ isIdle: idle }),

  pointer: { x: 0.5, y: 0.5 },
  setPointer: (x, y) => set({ pointer: { x, y } }),
}));
