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
 * Half the room's cross-section — the visible square is HALF*2 units on
 * each edge (width and height).
 */
const HALF = 10.5;
/**
 * Half the tunnel's length (its Z extent), independent of HALF. A cube
 * (DEPTH === HALF) barely shows its far wall as smaller than its near
 * one from a camera standing just inside one face, so it read as "one
 * big square" rather than a tunnel receding into the distance. Making
 * the tunnel much longer than it is wide is what actually produces the
 * shrinking-toward-a-point perspective the reference mockup shows.
 * Pushed further each round (5x -> 8x -> 14x) as the vanishing point kept
 * reading as too large/flat at the previous depth — keep this in sync
 * with the camera z position in RoomCanvas.tsx if it changes again.
 */
const DEPTH = HALF * 14;
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
 * Picks which wall regions the next ripple pass lights up. Weighted so the
 * full concentric ring — every wall together — is still the most common
 * shape, with the narrower options mixed in often enough to keep the
 * animation from reading as one fixed, repeating loop.
 */
function pickCascadeMask(): { left: number; right: number; ceiling: number; floor: number } {
  const r = Math.random();
  if (r < 0.5) return { left: 1, right: 1, ceiling: 1, floor: 1 }; // full ring
  if (r < 0.67) return { left: 1, right: 0, ceiling: 0, floor: 0 }; // left wall only
  if (r < 0.84) return { left: 0, right: 1, ceiling: 0, floor: 0 }; // right wall only
  return { left: 0, right: 0, ceiling: 1, floor: 1 }; // ceiling + floor only
}

/**
 * "The Room" — a visitor stands at the edge of a sharp-cornered square
 * tunnel (rendered from the inside) and looks inward, down a series of
 * square frames receding into the distance. Rather than five flat panels
 * with independently-colored seams, the whole surface is one shader:
 * color blends smoothly between neighboring walls right up to each real,
 * sharp edge. One shared pulse keeps the whole room breathing in the same
 * rhythm as the music; each "wall" region also leans on its own frequency
 * band and phase so it still feels individually alive.
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
  // Which wall regions the ripple lights up. Left at "full ring" (all 1s)
  // most of the time, but a bass cue occasionally narrows it to just one
  // side wall or just ceiling+floor, so the cascade doesn't always trace
  // the exact same shape every pass. Current values ease toward the target
  // each frame (see CASCADE_MASK_RATE below) rather than snapping, so a
  // mode change fades in/out instead of popping.
  const cascadeMaskTarget = useRef({ left: 1, right: 1, ceiling: 1, floor: 1 });
  const cascadeMaskCurrent = useRef({ left: 1, right: 1, ceiling: 1, floor: 1 });

  const geometry = useMemo(
    // The color/fluting comes entirely from the fragment shader reading
    // vPos, not from vertex normals, so a flat face looks identical at any
    // subdivision — 14 segments was only ever buying smoother *corner*
    // curvature. With the corners now nearly sharp (see CORNER_RADIUS)
    // that resolution is wasted, so this is dropped to 4.
    () => new RoundedBoxGeometry(HALF * 2, HALF * 2, DEPTH * 2, 4, CORNER_RADIUS),
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
      uHalf: { value: new THREE.Vector3(HALF, HALF, DEPTH) },
      uTime: { value: 0 },
      uCascadePhase: { value: 0 },
      uCascadeStrength: { value: 0.08 },
      uCascadeWidth: { value: 0.13 },
      uCascadeMaskLeft: { value: 1 },
      uCascadeMaskRight: { value: 1 },
      uCascadeMaskCeiling: { value: 1 },
      uCascadeMaskFloor: { value: 1 },
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
    // the ripple cascade below, each on its own cooldown so it reads as
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
      // Re-roll which walls the cascade favors on the biggest cue (bass),
      // rather than every cue — narrowing the shape on every hi-hat would
      // make the room feel twitchy rather than just varied over time.
      cascadeMaskTarget.current = pickCascadeMask();
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
    // Continuous attack/release toward the cue target. Eased further this
    // round — the previous 6.5 attack rate still reached ~90% of full
    // strength in under half a second, which read as a quick snap rather
    // than a build once combined with the shader's own softened glow curve.
    // Slowing both the rise and the fall gives the pulse (and everything it
    // drives — cascade speed/strength/width) a genuinely gradual swell in
    // and settle out instead of a sharp attack with a merely-slower decay.
    const pulseRate = cascadePulseTarget.current > cascadePulse.current ? 4.2 : 1.1;
    cascadePulse.current +=
      (cascadePulseTarget.current - cascadePulse.current) * Math.min(1, delta * pulseRate);
    cascadePulseTarget.current *= Math.pow(0.5, delta / 0.55);

    // Ease the wall mask toward its (possibly just re-rolled) target too,
    // so switching which walls the cascade favors fades in rather than
    // popping between one shape and another mid-animation.
    const maskRate = 1.4;
    const maskTarget = cascadeMaskTarget.current;
    const maskCurrent = cascadeMaskCurrent.current;
    maskCurrent.left += (maskTarget.left - maskCurrent.left) * Math.min(1, delta * maskRate);
    maskCurrent.right += (maskTarget.right - maskCurrent.right) * Math.min(1, delta * maskRate);
    maskCurrent.ceiling +=
      (maskTarget.ceiling - maskCurrent.ceiling) * Math.min(1, delta * maskRate);
    maskCurrent.floor += (maskTarget.floor - maskCurrent.floor) * Math.min(1, delta * maskRate);

    // Square-frame lighting cascade: a single ripple travels from the
    // back wall out toward the viewer once every 1/cascadeSpeed seconds
    // (see the shader), lighting the whole cross-section — ceiling,
    // floor, and both side walls — together at each moment rather than
    // one column at a time. Baseline speed/strength sit close to zero now
    // (rather than a third-or-more of their max, which made the cascade
    // loop at roughly the same rate and brightness no matter what was
    // playing) — quiet passages let it nearly stall, a held breath, so
    // loud ones read as a real surge instead of a modest bump on a
    // cascade that was already constantly running.
    const cascadeSpeed = 0.04 + normalized.overall * 0.85 + cascadePulse.current * 1.4;
    cascadePhase.current += delta * cascadeSpeed;
    const cascadeStrength = Math.min(
      0.55,
      0.03 + Math.pow(normalized.overall, 1.6) * 0.32 + cascadePulse.current * 0.32
    );
    // The ripple's own width now swells on a hit too — not just brighter,
    // but visibly thicker as it passes — so a cue reads as more than a
    // color/speed change layered on an otherwise-identical band.
    const cascadeWidth = 0.13 + cascadePulse.current * 0.24 + normalized.overall * 0.06;

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
        // Pushed saturation up and lightness down from the original
        // 0.5/0.58 — that combination read as pastel/washed-out once mixed
        // with the shader's own white-leaning blends downstream. This is
        // the raw "peak" hue the shader then dials up further toward the
        // vanishing point (see satDepth in the fragment shader) and pulls
        // back toward pastel near the viewer.
        color.setHSL(hue / 360, 0.8, 0.5);

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
      material.uniforms.uCascadeWidth.value = cascadeWidth;
      material.uniforms.uCascadeMaskLeft.value = maskCurrent.left;
      material.uniforms.uCascadeMaskRight.value = maskCurrent.right;
      material.uniforms.uCascadeMaskCeiling.value = maskCurrent.ceiling;
      material.uniforms.uCascadeMaskFloor.value = maskCurrent.floor;
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
      {/* Fog distances now scale with the tunnel's length (DEPTH), not its
          cross-section (HALF) — the old values were tuned for a room whose
          depth and width were the same, so they barely faded anything
          across this much longer tunnel. */}
      <fog attach="fog" args={[room.palette.bg, DEPTH * 0.5, DEPTH * 1.9]} />
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
