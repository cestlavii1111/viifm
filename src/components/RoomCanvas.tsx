"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback } from "react";
import type { Room } from "@/types/room";
import { SCENES } from "@/lib/rooms";
import { AnalyserProvider } from "@/lib/audio-context";
import { useExperience } from "@/lib/store";

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
    <div className="absolute inset-0" onPointerMove={handlePointerMove}>
      <AnalyserProvider value={analyser}>
        <Canvas
          // z=146 sits just inside the tunnel's front opening (CubeRoom's
          // DEPTH is 147) — keep this in sync with CubeRoom's DEPTH
          // constant if that ever changes.
          camera={{ position: [0, 0, 146], fov: 72 }}
          gl={{ antialias: true }}
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
