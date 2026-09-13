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
 * Where the camera sits along the tunnel's axis at rest, just inside the
 * front opening. Exported so RoomCanvas's initial camera position can
 * derive from this instead of a hand-copied literal that has to be kept
 * in sync by hand whenever DEPTH changes.
 */
export const CAMERA_BASE_Z = DEPTH - 1;
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
  const isPlaying = useExperience((s) => s.isPlaying);
  const { camera } = useThree();

  // How "live" the room is right now — 1 while music plays, easing down to
  // 0 (pure white, no color at all) once it's paused. Without this, the
  // room never actually goes fully white on pause: each wall has its own
  // slow "breathing" sine baked in below (ownBreath) that keeps a faint
  // tint alive regardless of audio, and the cascade has its own small
  // baseline strength — both are silenced by scaling them with this.
  const liveness = useRef(1);
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
  // Accumulated "how far the painted panel pattern has scrolled," in panel
  // widths. This — not any real camera travel — is what makes the tunnel
  // read as endless: the room itself is a single, finite box, so actually
  // flying the camera down its length would eventually hit the back wall.
  // Scrolling the pattern instead has no such limit and never needs a
  // seam/reset. See uDepthScroll in the shader.
  const depthScroll = useRef(0);

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
  const fogRef = useRef<THREE.Fog | null>(null);
  // The room's actual base color (used by the shader at rest) is a clean
  // neutral vec3(0.96) — but fog was still always tinting the far end of
  // the tunnel toward room.palette.bg (a colored background), completely
  // independent of liveness/intensity. That's what left a faint tint
  // visible at the vanishing point even once every audio-driven term had
  // correctly eased all the way to zero: the fog color itself was never
  // part of that gating. Eased alongside liveness so paused/silent rooms
  // fade all the way to a neutral fog too, not just a neutral wall base.
  const fogColorLive = useMemo(() => new THREE.Color(room.palette.bg), [room.palette.bg]);
  const fogColorRest = useMemo(() => new THREE.Color(0.96, 0.96, 0.96), []);

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
      uDepthScroll: { value: 0 },
      // The base surface is now an intentionally clean white (see the
      // shader) rather than a bright-clipping colored wash, so exposure
      // no longer needs to fight the base itself — it only needs to keep
      // headroom for the colored light (washes/hot-spot/tunnel) so those
      // don't blow out. Raised from 0.92 to 1.0 alongside the saturation
      // increases in this same round — at 0.92 the extra saturation still
      // read a touch dim/muted rather than genuinely vivid.
      uExposure: { value: 1.0 },
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

    // Ease toward fully live (1) while playing, or all the way down to
    // silent/white (0) once paused. Slower on the way down ("slowly fade
    // all the way to white") than on the way back up, so resuming feels
    // prompt but stopping settles gently.
    const livenessTarget = isPlaying ? 1 : 0;
    const livenessRate = livenessTarget > liveness.current ? 1.1 : 0.6;
    liveness.current += (livenessTarget - liveness.current) * Math.min(1, delta * livenessRate);
    // This kind of ease-toward-target only ever *approaches* its target —
    // it mathematically never quite reaches exactly 0, which with Bloom's
    // own tendency to pick out and haze even a faint residual color left
    // the room visibly not-quite-white long after pausing. Snapping the
    // last sliver closes that gap so it actually settles to pure white.
    if (livenessTarget === 0 && liveness.current < 0.01) liveness.current = 0;
    if (livenessTarget === 1 && liveness.current > 0.995) liveness.current = 1;

    if (fogRef.current) {
      fogRef.current.color.copy(fogColorRest).lerp(fogColorLive, liveness.current);
    }

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
      // Pushed past 1 (was capped at 1) — the shader's own strength/amp
      // curve already saturates gently, so a bigger raw target here mostly
      // buys a faster, wider sweep rather than blowing out brightness,
      // which is what makes a bass drop read as unmistakably the "big"
      // cue rather than just a slightly-brighter version of a snare hit.
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 1.3);
      // Re-roll which walls the cascade favors on the biggest cue (bass),
      // rather than every cue — narrowing the shape on every hi-hat would
      // make the room feel twitchy rather than just varied over time.
      cascadeMaskTarget.current = pickCascadeMask();
    }
    if (normalized.mid > 0.82 && t - lastMidCueTime.current > 0.6) {
      lastMidCueTime.current = t;
      hueDrift.current += 15 + Math.random() * 45;
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 0.65);
    }
    if (normalized.treble > 0.85 && t - lastTrebleCueTime.current > 0.35) {
      lastTrebleCueTime.current = t;
      hueDrift.current += 8 + Math.random() * 20;
      cascadePulseTarget.current = Math.max(cascadePulseTarget.current, 0.35);
    }
    // Attack/release toward the cue target — sped up on both ends this
    // round (rise 4.2 -> 5.8, fall 1.1 -> 2.4, target decay half-life
    // 0.55s -> 0.3s). The previous, slower pair was tuned for a smooth
    // swell, but combined with cascadeSpeed/Strength below leaning heavily
    // on the *continuous* normalized.overall term (not this pulse), the
    // net effect was a cascade that stayed almost constantly lit and
    // moving regardless of what the music was actually doing — never
    // really settling between hits, so distinct cues barely read as
    // distinct. Snapping this pulse up fast and letting it fall back down
    // hard between hits is what makes each one read as its own event
    // ("choreographed") instead of one continuous wash ("too constant").
    const pulseRate = cascadePulseTarget.current > cascadePulse.current ? 5.8 : 2.4;
    cascadePulse.current +=
      (cascadePulseTarget.current - cascadePulse.current) * Math.min(1, delta * pulseRate);
    cascadePulseTarget.current *= Math.pow(0.5, delta / 0.3);

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
    // one column at a time. Driven almost entirely by cascadePulse now
    // (the discrete, cue-triggered envelope above) rather than the
    // continuous normalized.overall loudness it leaned on before —
    // normalized.overall stays mid-range fairly often (it's a rolling
    // auto-gain normalization, not a raw level), so weighting it this
    // heavily kept the cascade almost always moving and glowing at a
    // similar rate/brightness no matter what was actually playing, which
    // is exactly the "too constant" read. A tiny idle creep is kept so it
    // never looks fully frozen/broken during a real silence, but the real
    // sweeps — the ones that should feel choreographed — now only happen
    // when a bass/mid/treble cue actually fires.
    const IDLE_CASCADE_SPEED = 0.02;
    const cascadeSpeed = IDLE_CASCADE_SPEED + cascadePulse.current * 2.6;
    cascadePhase.current += delta * cascadeSpeed;
    const IDLE_CASCADE_STRENGTH = 0.015;
    const cascadeStrength =
      Math.min(0.62, IDLE_CASCADE_STRENGTH + Math.pow(cascadePulse.current, 1.1) * 0.58) *
      liveness.current;
    // The ripple's own width now swells on a hit too — not just brighter,
    // but visibly thicker as it passes — so a cue reads as more than a
    // color/speed change layered on an otherwise-identical band.
    const cascadeWidth = 0.1 + cascadePulse.current * 0.34;

    // Panel widths per second the tunnel's pattern flows toward the
    // viewer — this is the "endless forward flight" illusion (see the
    // shader's uDepthScroll). Slow and mostly steady on purpose ("slowly
    // moves forward"), with a slight lift from the music's own energy so
    // it doesn't feel metronomic either.
    const depthScrollSpeed = 0.55 + normalized.overall * 0.35;
    depthScroll.current += delta * depthScrollSpeed;

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
        // Scaled by liveness so pausing actually settles the room to pure
        // white — ownBreath above has no dependency on audio at all, so
        // without this the room kept a faint, endless tint even in
        // silence.
        const intensity = Math.min(1, Math.max(0, combined)) * liveness.current;

        const hue = (wall.hue + hueDrift.current * 0.6 + bands.treble * 10) % 360;
        const color = new THREE.Color();
        // Pushed saturation up further (0.8 -> 0.94) — even at 0.8 the
        // walls still read as slightly muted once mixed with the shader's
        // own white-leaning blends downstream (see satDepth below, and
        // ambient's mix-toward-white), so the raw peak hue needed more
        // headroom to still land as a genuinely vivid color once diluted.
        // This is the raw "peak" hue the shader then dials up further
        // toward the vanishing point and pulls back toward pastel near the
        // viewer.
        color.setHSL(hue / 360, 0.94, 0.5);

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
      material.uniforms.uDepthScroll.value = depthScroll.current;
    }

    // Subtle head-turn toward the pointer — the visitor looking around the
    // room from where they stand, not moving through it.
    const targetYaw = (pointer.x - 0.5) * 0.5;
    const targetPitch = (0.5 - pointer.y) * 0.25;
    camera.rotation.y += (targetYaw - camera.rotation.y) * 0.04;
    camera.rotation.x += (targetPitch - camera.rotation.x) * 0.04;

    // Slow forward-and-back drift along the tunnel's axis — real camera
    // movement (not just the painted pattern above) so the box's actual
    // corners/edges genuinely slide past, the way they would if you were
    // physically floating through the space. It's a smooth, silent loop
    // (a sine, easing at both ends) rather than a one-way crawl: actually
    // traversing the length of this — necessarily finite — room would
    // eventually reach the back wall. The *endless* half of "never-ending
    // tunnel" comes from depthScroll above, which has no such limit; this
    // is just what sells the motion as physically real.
    const driftSpan = 16; // world units of forward travel at the peak
    const driftPeriod = 42; // seconds for one full forward-and-back cycle
    const driftPhase =
      (Math.sin((t / driftPeriod) * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0..1, starts at 0
    camera.position.z = CAMERA_BASE_Z - driftPhase * driftSpan;
  });

  return (
    <group>
      {/* Fog distances now scale with the tunnel's length (DEPTH), not its
          cross-section (HALF) — the old values were tuned for a room whose
          depth and width were the same, so they barely faded anything
          across this much longer tunnel. */}
      <fog ref={fogRef} attach="fog" args={[room.palette.bg, DEPTH * 0.5, DEPTH * 1.9]} />
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
