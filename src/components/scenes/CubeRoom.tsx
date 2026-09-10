"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Room } from "@/types/room";
import { useAnalyser } from "@/lib/audio-context";
import {
  createFrequencyBuffer,
  readFrequencyBands,
  type FrequencyBands,
} from "@/lib/audio-engine";
import { useExperience } from "@/lib/store";
import {
  frostedGlassRoomVertexShader,
  frostedGlassRoomFragmentShader,
} from "@/lib/shaders/frosted-glass-room";

/**
 * Half the room's side length — the room is HALF*2 units on each edge.
 * 10.5 (up from 7) gives the room 50% more scale — the goal is an
 * engulfing, Turrell-Ganzfeld-like field of color rather than a tight box.
 */
const HALF = 10.5;
/** How generously the corners/edges round off — a large fraction of HALF
 * so the room reads as one continuous curved surface, not a beveled box. */
const CORNER_RADIUS = HALF * 0.42;

type BandKey = keyof FrequencyBands;
type WallId = "back" | "left" | "right" | "ceiling" | "floor";

interface WallDef {
  id: WallId;
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
 * "The Room" — a visitor stands at the edge of one continuous, rounded
 * chamber (rendered from the inside) and looks inward. Rather than five
 * flat panels meeting at hard corners, the whole surface is one shader:
 * color and curvature soften together at every seam, closer to a Turrell
 * Ganzfeld space than a tight room. One shared pulse keeps the whole room
 * breathing in the same rhythm as the music; each "wall" region also leans
 * on its own frequency band and phase so it still feels individually alive.
 */
export default function CubeRoom({ room }: { room: Room }) {
  const analyser = useAnalyser();
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pointer = useExperience((s) => s.pointer);
  const { camera } = useThree();

  const sharedEnvelope = useRef(0.15);
  const wallEnvelopes = useRef<Record<WallId, number>>({
    back: 0.15,
    left: 0.15,
    right: 0.15,
    ceiling: 0.15,
    floor: 0.15,
  });
  const hueDrift = useRef(0);

  const geometry = useMemo(
    () => new RoundedBoxGeometry(HALF * 2, HALF * 2, HALF * 2, 14, CORNER_RADIUS),
    []
  );

  const walls: WallDef[] = useMemo(() => {
    const backHue = hueFromHex(room.palette.primary);
    const sideHue = hueFromHex(room.palette.secondary);
    const trimHue = hueFromHex(room.palette.accent);
    return [
      { id: "back", hue: backHue, band: "mid", variance: 0.35, phase: 0 },
      { id: "left", hue: sideHue, band: "treble", variance: 0.45, phase: Math.PI * 0.33 },
      { id: "right", hue: sideHue, band: "treble", variance: 0.45, phase: Math.PI * 1.1 },
      { id: "ceiling", hue: trimHue, band: "overall", variance: 0.2, phase: Math.PI * 0.6 },
      { id: "floor", hue: trimHue, band: "bass", variance: 0.4, phase: Math.PI * 1.6 },
    ];
  }, [room.palette]);

  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const uniforms = useMemo(
    () => ({
      uColorBack: { value: new THREE.Color("#ffffff") },
      uColorLeft: { value: new THREE.Color("#ffffff") },
      uColorRight: { value: new THREE.Color("#ffffff") },
      uColorCeiling: { value: new THREE.Color("#ffffff") },
      uColorFloor: { value: new THREE.Color("#ffffff") },
      uIntensityBack: { value: 0.2 },
      uIntensityLeft: { value: 0.2 },
      uIntensityRight: { value: 0.2 },
      uIntensityCeiling: { value: 0.2 },
      uIntensityFloor: { value: 0.2 },
      uHalf: { value: HALF },
      uTime: { value: 0 },
    }),
    []
  );

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
    const sharedTarget = Math.min(1, bands.overall * 3.2 + breath * 0.45);
    sharedEnvelope.current +=
      (sharedTarget - sharedEnvelope.current) * Math.min(1, delta * 1.2);

    hueDrift.current += delta * 1.1; // degrees/sec — very slow overall drift

    const material = materialRef.current;
    if (material) {
      for (const wall of walls) {
        const bandValue = bands[wall.band];
        const prevEnv = wallEnvelopes.current[wall.id];
        const nextEnv = prevEnv + (bandValue - prevEnv) * Math.min(1, delta * 1.6);
        wallEnvelopes.current[wall.id] = nextEnv;

        const ownBreath = (Math.sin(t * 0.3 + wall.phase) + 1) / 2;
        const combined =
          sharedEnvelope.current * (1 - wall.variance) +
          nextEnv * wall.variance +
          ownBreath * 0.12;
        const intensity = Math.min(1, Math.max(0, combined));

        const hue = (wall.hue + hueDrift.current * 0.6 + bands.treble * 10) % 360;
        const color = new THREE.Color();
        color.setHSL(hue / 360, 0.5, 0.58);

        const capitalized = wall.id.charAt(0).toUpperCase() + wall.id.slice(1);
        const colorUniform = uniforms[`uColor${capitalized}` as keyof typeof uniforms] as {
          value: THREE.Color;
        };
        const intensityUniform = uniforms[
          `uIntensity${capitalized}` as keyof typeof uniforms
        ] as { value: number };
        colorUniform.value.copy(color);
        intensityUniform.value = intensity;
      }
      material.uniforms.uTime.value = t;
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
      <mesh geometry={geometry}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={frostedGlassRoomVertexShader}
          fragmentShader={frostedGlassRoomFragmentShader}
          uniforms={uniforms}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
