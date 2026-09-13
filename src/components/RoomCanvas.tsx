"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback } from "react";
import type { Room } from "@/types/room";
import { SCENES } from "@/lib/rooms";
import { AnalyserProvider } from "@/lib/audio-context";
import { useExperience } from "@/lib/store";
import { CAMERA_BASE_Z } from "@/components/scenes/CubeRoom";

export default function RoomCanvas({
  room,
  analyser,
}: {
  room: Room;
  analyser: AnalyserNode | null;
}) {
  const setPointer = useExperience((s) => s.setPointer);
  const SceneComponent = SCENES[room.scene];

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setPointer(x, y);
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
    <div className="absolute inset-0 touch-none" onPointerMove={handlePointerMove}>
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
            <Bloom
              intensity={0.45}
              luminanceThreshold={0.85}
              luminanceSmoothing={0.35}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.4} darkness={0.4} />
          </EffectComposer>
        </Canvas>
      </AnalyserProvider>
    </div>
  );
}
