"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "@/types/room";
import { useAnalyser } from "@/lib/audio-context";
import {
  createFrequencyBuffer,
  readFrequencyBands,
  type FrequencyBands,
} from "@/lib/audio-engine";
import { useExperience } from "@/lib/store";

/** Half the cube's side length — the room is HALF*2 units on each edge. */
const HALF = 7;
/** Margin between a wall's dark frame and its glowing inner light panel. */
const PANEL_MARGIN = 0.9;

type BandKey = keyof FrequencyBands;

interface WallDef {
  id: string;
  /** Position of the wall's center */
  position: [number, number, number];
  /** Euler rotation so the panel's local +z normal points into the room */
  rotation: [number, number, number];
  size: [number, number];
  /** Base hue in degrees (0-360) */
  hue: number;
  /** Which frequency band nudges this wall beyond the shared pulse */
  band: BandKey;
  /** 0..1 — how much this wall leans on its own band vs. the shared pulse */
  variance: number;
  /** Phase offset (radians) for this wall's own slow breathing cycle */
  phase: number;
}

function hueFromHex(hex: string): number {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.h * 360;
}

/**
 * "The Room" — a cube the visitor stands at the edge of, looking inward.
 * Five walls (the wall behind the visitor is left dark/unrendered) act as
 * soft light panels that breathe together in time with the music: one
 * shared pulse keeps everything in rhythm, while each wall leans on its own
 * frequency band and phase so the room still feels individually alive.
 */
export default function CubeRoom({ room }: { room: Room }) {
  const analyser = useAnalyser();
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pointer = useExperience((s) => s.pointer);
  const { camera } = useThree();

  const sharedEnvelope = useRef(0.15);
  const wallEnvelopes = useRef<Record<string, number>>({});
  const hueDrift = useRef(0);

  const walls: WallDef[] = useMemo(() => {
    const backHue = hueFromHex(room.palette.primary);
    const sideHue = hueFromHex(room.palette.secondary);
    const trimHue = hueFromHex(room.palette.accent);
    return [
      {
        id: "back",
        position: [0, 0, -HALF],
        rotation: [0, 0, 0],
        size: [HALF * 2, HALF * 2],
        hue: backHue,
        band: "mid",
        variance: 0.35,
        phase: 0,
      },
      {
        id: "left",
        position: [-HALF, 0, 0],
        rotation: [0, Math.PI / 2, 0],
        size: [HALF * 2, HALF * 2],
        hue: sideHue,
        band: "treble",
        variance: 0.45,
        phase: Math.PI * 0.33,
      },
      {
        id: "right",
        position: [HALF, 0, 0],
        rotation: [0, -Math.PI / 2, 0],
        size: [HALF * 2, HALF * 2],
        hue: sideHue,
        band: "treble",
        variance: 0.45,
        phase: Math.PI * 1.1,
      },
      {
        id: "ceiling",
        position: [0, HALF, 0],
        rotation: [Math.PI / 2, 0, 0],
        size: [HALF * 2, HALF * 2],
        hue: trimHue,
        band: "overall",
        variance: 0.2,
        phase: Math.PI * 0.6,
      },
      {
        id: "floor",
        position: [0, -HALF, 0],
        rotation: [-Math.PI / 2, 0, 0],
        size: [HALF * 2, HALF * 2],
        hue: trimHue,
        band: "bass",
        variance: 0.4,
        phase: Math.PI * 1.6,
      },
    ];
  }, [room.palette]);

  const panelRefs = useRef<Record<string, THREE.Mesh | null>>({});

  useFrame((state, delta) => {
    let bands: FrequencyBands = { bass: 0.1, mid: 0.1, treble: 0.1, overall: 0.1 };
    if (analyser) {
      if (!bufferRef.current) bufferRef.current = createFrequencyBuffer(analyser);
      bands = readFrequencyBands(analyser, bufferRef.current);
    }

    const t = state.clock.elapsedTime;

    // A slow, independent "breathing" cycle so the room stays alive even
    // during quiet passages — trance rooms pulse whether or not anything
    // percussive is happening.
    const breath = (Math.sin(t * 0.35) + 1) / 2;

    // Shared envelope: smoothed overall loudness blended with the breath
    // cycle. Heavy smoothing keeps this a slow pulse, not a flicker.
    const sharedTarget = Math.min(1, bands.overall * 1.6 * 0.7 + breath * 0.3);
    sharedEnvelope.current +=
      (sharedTarget - sharedEnvelope.current) * Math.min(1, delta * 1.2);

    hueDrift.current += delta * 1.1; // degrees/sec — very slow overall drift

    for (const wall of walls) {
      const mesh = panelRefs.current[wall.id];
      if (!mesh) continue;

      const bandValue = bands[wall.band];
      const prevEnv = wallEnvelopes.current[wall.id] ?? 0.15;
      const nextEnv = prevEnv + (bandValue - prevEnv) * Math.min(1, delta * 1.6);
      wallEnvelopes.current[wall.id] = nextEnv;

      const ownBreath = (Math.sin(t * 0.3 + wall.phase) + 1) / 2;
      const combined =
        sharedEnvelope.current * (1 - wall.variance) +
        nextEnv * wall.variance +
        ownBreath * 0.08;
      const intensity = Math.min(1, Math.max(0, combined));

      const hue = (wall.hue + hueDrift.current * 0.6 + bands.treble * 10) % 360;
      const saturation = 0.28 + intensity * 0.32; // stays gentle, never neon
      const lightness = 0.22 + intensity * 0.32; // soft glow, never blown out

      const color = new THREE.Color();
      color.setHSL(hue / 360, saturation, lightness);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(color);
    }

    // Subtle head-turn toward the pointer — the visitor looking around the
    // room from where they stand, not moving through it.
    const targetYaw = (pointer.x - 0.5) * 0.5;
    const targetPitch = (0.5 - pointer.y) * 0.25;
    camera.rotation.y += (targetYaw - camera.rotation.y) * 0.04;
    camera.rotation.x += (targetPitch - camera.rotation.x) * 0.04;
  });

  return (
    <group>
      <fog attach="fog" args={[room.palette.bg, HALF * 1.4, HALF * 3.2]} />

      {walls.map((wall) => (
        <group key={wall.id} position={wall.position} rotation={wall.rotation}>
          {/* dark structural wall */}
          <mesh>
            <planeGeometry args={wall.size} />
            <meshBasicMaterial color="#08080a" />
          </mesh>
          {/* glowing inset light panel — the part that's audio-reactive */}
          <mesh
            position={[0, 0, 0.03]}
            ref={(m) => {
              panelRefs.current[wall.id] = m;
            }}
          >
            <planeGeometry
              args={[wall.size[0] - PANEL_MARGIN * 2, wall.size[1] - PANEL_MARGIN * 2]}
            />
            <meshBasicMaterial color="#222222" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
