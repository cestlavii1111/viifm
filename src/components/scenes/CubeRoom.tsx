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
/**
 * How generously the corners/edges round off. This used to be a large
 * fraction of HALF so the whole room read as one continuous curved
 * surface — but at that scale the curvature dominated the silhouette and
 * read as a bulging "onion" rather than a room. A near-zero radius here
 * (just enough to avoid a truly infinite-sharp edge, which can cause
 * lighting/shading artifacts) gives sharp square cross-sections instead:
 * a tunnel of square frames receding back rather than a rounded chamber.
 */
const CORNER_RADIUS = HALF * 0.02;

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
  // Auto-gain: track a rolling ceiling (recent loud peak) and floor (recent
  // quiet level) per band, so the room reacts to *this* track's own
  // dynamic range rather than a fixed multiplier tuned against the old
  // placeholder synth pad. A hot, full-mix master reads much louder on the
  // analyser than that sparse pad did — a fixed multiplier tuned for the
  // pad clamps a real track near max brightness almost permanently, which
  // looks static instead of pulsing. A peak-only normalizer isn't enough
  // either: on a steady rise it tracks the current value 1:1 and still
  // reads as constantly "maxed" — the ceiling and floor need to relax
  // toward the signal slowly (jumping instantly only to a new extreme) so
  // there's real contrast between a section's quiet and loud moments.
  const bandCeilings = useRef<Record<BandKey, number>>({
    bass: 0.3,
    mid: 0.3,
    treble: 0.3,
    overall: 0.3,
  });
  const bandFloors = useRef<Record<BandKey, number>>({
    bass: 0.03,
    mid: 0.03,
    treble: 0.03,
    overall: 0.03,
  });
  // Stage-lighting cues: a hit above a band's own recent range fires a
  // "go" — a color jump plus a bright pulse feeding the column-cascade
  // effect below — instead of everything drifting continuously. Each band
  // gets its own cooldown so a bass drop, a snare/vocal hit, and a
  // hi-hat/cymbal can all cue independently rather than only bass ever
  // triggering anything.
  const cascadePhase = useRef(0);
  const cascadePulse = useRef(0);
  const cascadePulseTarget = useRef(0);
  const lastBassCueTime = useRef(-10);
  const lastMidCueTime = useRef(-10);
  const lastTrebleCueTime = useRef(-10);

  const geometry = useMemo(
    // The color/fluting comes entirely from the fragment shader reading
    // vPos, not from vertex normals, so a flat face looks identical at any
    // subdivision — 14 segments was only ever buying smoother *corner*
    // curvature. With the corners now nearly sharp (see CORNER_RADIUS)
    // that resolution is wasted, so this is dropped to 4.
    () => new RoundedBoxGeometry(HALF * 2, HALF * 2, HALF * 2, 4, CORNER_RADIUS),
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
      uCascadePhase: { value: 0 },
      uCascadeStrength: { value: 0.08 },
      // The base surface is now an intentionally clean white (see the
      // shader) rather than a bright-clipping colored wash, so exposure
      // no longer needs to fight the base itself — it only needs to keep
      // headroom for the colored light (washes/hot-spot/tunnel) so those
      // don't blow out. 0.68 was tuned for the old always-colored surface;
      // at that level it reads as dull grey instead of white.
      uExposure: { value: 0.92 },
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

    // Update each band's rolling ceiling/floor (jump instantly to a new
    // extreme, relax back toward the signal with an ~6s half-life
    // otherwise) and use the two to normalize this frame's reading to
    // 0..1 relative to the track's own recent dynamic range.
    const RELAX_HALF_LIFE = 6; // seconds
    const relax = 1 - Math.pow(0.5, delta / RELAX_HALF_LIFE);
    const normalized = {} as FrequencyBands;
    (Object.keys(bands) as BandKey[]).forEach((key) => {
      const value = bands[key];
      const prevCeiling = bandCeilings.current[key];
      const prevFloor = bandFloors.current[key];
      const ceiling = value > prevCeiling ? value : prevCeiling + (value - prevCeiling) * relax;
      const floor = value < prevFloor ? value : prevFloor + (value - prevFloor) * relax;
      bandCeilings.current[key] = ceiling;
      bandFloors.current[key] = floor;
      const range = Math.max(ceiling - floor, 0.02);
      normalized[key] = Math.min(1, Math.max(0, (value - floor) / range));
    });

    // Shared envelope: smoothed overall loudness blended with the breath
    // cycle. Attack is quick (snaps up on a loud moment, like a lighting
    // board reacting to a cue) while release is slower, so the room reads
    // as *triggered* by the music rather than lagging behind it uniformly.
    const sharedTarget = Math.min(1, normalized.overall * 0.85 + breath * 0.25);
    const sharedRate = sharedTarget > sharedEnvelope.current ? 3.2 : 0.9;
    sharedEnvelope.current +=
      (sharedTarget - sharedEnvelope.current) * Math.min(1, delta * sharedRate);

    hueDrift.current += delta * 1.1; // degrees/sec — very slow overall drift

    // A hard hit in any band — well above that band's own recent range —
    // fires a lighting "cue": an immediate hue jump plus a pulse feeding
    // the column-cascade below, each on its own cooldown so it reads as
    // distinct cues rather than flicker. Bass drops are the biggest
    // swings (a bass drop feeling different from a hi-hat is the point),
    // mid catches snares/vocals with a moderate swing, and treble catches
    // hi-hats/cymbals with a light one on a much shorter cooldown since
    // those transients repeat much faster. Math.max on the pulse target
    // means a smaller cue never steals brightness from a bigger one
    // already in progress. The pulse itself builds and settles through a
    // proper attack/release envelope rather than snapping straight to
    // full strength — a hard jump to 1 read as an abrupt flash rather
    // than a swell. Cues also speed up the ripple's travel (below)
    // instead of teleporting its position, so a hit reads as the ripple
    // surging forward, never a jump-cut.
    if (normalized.bass > 0.8 && t - lastBassCueTime.current > 0.9) {
      lastBassCueTime.current = t;
      hueDrift.current += 30 + Math.random() * 90;
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 1);
    }
    if (normalized.mid > 0.82 && t - lastMidCueTime.current > 0.6) {
      lastMidCueTime.current = t;
      hueDrift.current += 15 + Math.random() * 45;
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 0.6);
    }
    if (normalized.treble > 0.85 && t - lastTrebleCueTime.current > 0.35) {
      lastTrebleCueTime.current = t;
      hueDrift.current += 8 + Math.random() * 20;
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 0.35);
    }
    // Fast-but-continuous attack (reaches most of the way to full
    // strength in ~150ms — quick enough to feel triggered by the hit,
    // slow enough not to snap), then the target itself relaxes back to 0
    // so the release is a slower, graceful fade rather than a hard cutoff.
    const pulseRate = cascadePulseTarget.current > cascadePulse.current ? 6.5 : 1.6;
    cascadePulse.current +=
      (cascadePulseTarget.current - cascadePulse.current) * Math.min(1, delta * pulseRate);
    cascadePulseTarget.current *= Math.pow(0.5, delta / 0.4);

    // Column-lighting cascade: a single ripple travels from the
    // back-center column out to the sides once every 1/cascadeSpeed
    // seconds (see the shader), sped up and brightened by overall loudness
    // and by the cue pulse above so louder passages send ripples out more
    // often rather than just one lonely pulse crawling along.
    const cascadeSpeed = 0.22 + normalized.overall * 0.55 + cascadePulse.current * 0.9;
    cascadePhase.current += delta * cascadeSpeed;
    const cascadeStrength = Math.min(
      0.5,
      0.11 + normalized.overall * 0.12 + cascadePulse.current * 0.22
    );

    const material = materialRef.current;
    if (material) {
      for (const wall of walls) {
        const bandValue = normalized[wall.band];
        const prevEnv = wallEnvelopes.current[wall.id];
        const wallRate = bandValue > prevEnv ? 5.0 : 1.3;
        const nextEnv = prevEnv + (bandValue - prevEnv) * Math.min(1, delta * wallRate);
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
      material.uniforms.uCascadePhase.value = cascadePhase.current;
      material.uniforms.uCascadeStrength.value = cascadeStrength;
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
