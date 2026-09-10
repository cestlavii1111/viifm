"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "@/types/room";
import { useAnalyser } from "@/lib/audio-context";
import {
  createFrequencyBuffer,
  readFrequencyBands,
} from "@/lib/audio-engine";
import { useExperience } from "@/lib/store";

const PARTICLE_COUNT = 2200;

/**
 * "Void Club" — a dark, particle-filled room with a pulsing light core.
 * Reused across rooms with different palettes; write a new scene component
 * and register it in src/lib/rooms.ts to give a room a completely different
 * visual language.
 */
export default function VoidClub({ room }: { room: Room }) {
  const analyser = useAnalyser();
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pointer = useExperience((s) => s.pointer);
  const { camera } = useThree();

  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // distribute inside a cylindrical "room" volume
      const radius = 3 + Math.random() * 9;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 10;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = height;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return arr;
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const primaryColor = useMemo(
    () => new THREE.Color(room.palette.primary),
    [room.palette.primary]
  );
  const secondaryColor = useMemo(
    () => new THREE.Color(room.palette.secondary),
    [room.palette.secondary]
  );

  useFrame((state, delta) => {
    let bass = 0.15;
    let mid = 0.15;
    let treble = 0.15;

    if (analyser) {
      if (!bufferRef.current) bufferRef.current = createFrequencyBuffer(analyser);
      const bands = readFrequencyBands(analyser, bufferRef.current);
      bass = bands.bass;
      mid = bands.mid;
      treble = bands.treble;
    }

    const t = state.clock.elapsedTime;

    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * (0.03 + treble * 0.15);
      const s = 1 + bass * 0.35;
      pointsRef.current.scale.setScalar(s);
      const material = pointsRef.current.material as THREE.PointsMaterial;
      material.size = 0.045 + mid * 0.06;
      material.opacity = 0.55 + treble * 0.4;
    }

    if (coreRef.current) {
      const coreScale = 0.6 + bass * 1.4;
      coreRef.current.scale.setScalar(coreScale);
      const mat = coreRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(primaryColor);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.15;
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.1) * 0.2;
      const ringScale = 2.2 + mid * 1.2;
      ringRef.current.scale.setScalar(ringScale);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(secondaryColor);
    }

    // pointer-driven parallax — visitor "moves" through the room
    const targetX = (pointer.x - 0.5) * 2.2;
    const targetY = (0.5 - pointer.y) * 1.2;
    camera.position.x += (targetX - camera.position.x) * 0.03;
    camera.position.y += (targetY + 0.4 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });

  return (
    <group>
      <fog attach="fog" args={[room.palette.bg, 6, 22]} />
      <ambientLight intensity={0.15} />

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          color={primaryColor}
          transparent
          opacity={0.7}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshBasicMaterial color={primaryColor} wireframe />
      </mesh>

      <mesh ref={ringRef}>
        <torusGeometry args={[2.4, 0.02, 8, 128]} />
        <meshBasicMaterial color={secondaryColor} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}
