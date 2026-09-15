"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useRef } from "react";
import type { Room } from "@/types/room";
import { SCENES } from "@/lib/rooms";
import { AnalyserProvider } from "@/lib/audio-context";
import { useExperience } from "@/lib/store";
import { CAMERA_BASE_Z } from "@/components/scenes/CubeRoom";

// Recenter gesture thresholds — a manual double-click/double-tap detector
// rather than the native `dblclick` event. `dblclick` doesn't reliably
// synthesize from touch here because this wrapper sets touch-action: none
// (see below) to stop iOS's own scroll/bounce gesture, and some mobile
// browsers skip synthesizing dblclick once a listener has claimed touch
// handling that way. Tracking pointerdown timing + distance ourselves
// works identically for mouse and touch.
const DOUBLE_TAP_MAX_MS = 350;
const DOUBLE_TAP_MAX_PX = 24;

export default function RoomCanvas({
  room,
  analyser,
}: {
  room: Room;
  analyser: AnalyserNode | null;
}) {
  const setPointer = useExperience((s) => s.setPointer);
  const SceneComponent = SCENES[room.scene];

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setPointer(x, y);
    },
    [setPointer]
  );

  // Pointer Events already unify mouse and touch, so a finger dragging
  // across the canvas fires the same onPointerMove above as a mouse move —
  // no touch-specific handling needed to steer the room/tunnel by touch.
  // The one real difference: a mouse has a resting position even when it
  // stops moving, so leaving it wherever the visitor last looked/steered
  // makes sense. A finger doesn't — once it lifts there's no "cursor"
  // position left on screen at all, so leaving the tunnel curved/the
  // camera turned until the next touch would just look stuck rather than
  // intentional. Recentering back to (0.5, 0.5) on release (only for
  // touch — a mouse click shouldn't do this) is what makes it read as
  // "steer while you're holding it, springs back when you let go."
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        setPointer(0.5, 0.5);
      }
    },
    [setPointer]
  );

  // Double-click (desktop) / double-tap (mobile) recenters the camera
  // straight down the tunnel. CubeRoom already eases camera.rotation
  // toward a target derived from the store's `pointer` value every frame
  // (see its useFrame), so recentering is just resetting pointer back to
  // its dead-center default (0.5, 0.5) — the existing per-frame easing
  // smoothly carries the camera back on its own, no new animation needed.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const now = performance.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.time <= DOUBLE_TAP_MAX_MS &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) <= DOUBLE_TAP_MAX_PX
      ) {
        setPointer(0.5, 0.5);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
      }
    },
    [setPointer]
  );

  return (
    // touch-action: none keeps a finger-drag over the empty tunnel from
    // triggering iOS's own scroll/bounce gesture — html/body already stop
    // the page itself from rubber-banding (see globals.css), but a touch
    // that starts directly on the canvas can otherwise still kick off a
    // native scroll before that ever kicks in. Scoped to this wrapper
    // only (not the whole page) so the volume slider in RoomHUD, which
    // sits in its own layer above this, keeps its normal touch dragging.
    <div
      className="absolute inset-0 touch-none"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <AnalyserProvider value={analyser}>
        <Canvas
          // Starts just inside the tunnel's front opening — CubeRoom then
          // takes over camera.position every frame (see its slow forward
          // drift) so this is just the pre-mount starting point.
          camera={{ position: [0, 0, CAMERA_BASE_Z], fov: 72 }}
          gl={{ antialias: true }}
          // Capped rather than left at the device's raw devicePixelRatio —
          // phones/tablets commonly report 3, and rendering this much
          // shader + Bloom/mipmapBlur post-processing at a full 3x buffer
          // is what actually turns "optimize for mobile" into dropped
          // frames rather than a sharper picture nobody can tell apart
          // from 2x on a phone screen.
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.setClearColor(room.palette.bg, 1);
          }}
        >
          <color attach="background" args={[room.palette.bg]} />
          <Suspense fallback={null}>
            <SceneComponent room={room} />
          </Suspense>
          <EffectComposer>
            {/* Bloom's own soft glow/haze is what actually reads as the
                room's "frosted glass" softness/desaturation — the walls
                themselves render sharp and vivid; it's this pass washing a
                soft white haze over everything that mutes and blurs the
                color underneath. Brought down further this round (0.3375
                -> 0.22) and the threshold raised (0.85 -> 0.92) so bloom
                only catches genuinely bright highlights (the cascade ripple,
                hot spots) instead of washing over the ambient wall color
                too — that ambient wash sitting well below the old 0.85
                threshold was still picking up enough bloom to read as a
                frosted haze over the whole room. mipmapBlur (a wide,
                multi-mip-level blur meant for soft cinematic glow) is
                dropped in favor of the plain default kernel, which spreads
                far less, so what bloom remains stays a tight highlight
                rather than a haze across the whole surface. */}
            <Bloom intensity={0.22} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.4} darkness={0.4} />
          </EffectComposer>
        </Canvas>
      </AnalyserProvider>
    </div>
  );
}
