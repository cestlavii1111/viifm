/**
 * Fluted frosted glass for the *whole room as one seamless surface* — used
 * with a rounded-box geometry (rendered from the inside) so there are no
 * hard seams where walls meet. Instead of five separately-colored panels,
 * every fragment blends between up to two neighboring "walls" based on
 * where it sits on the box, so color and geometry go soft at exactly the
 * same place: a Turrell-Ganzfeld-style coved room rather than a tight box.
 *
 * The surface itself is a neutral white — like a cyclorama in a
 * photo/video studio — and stays that way at rest. Color only ever
 * appears on individual fluted columns once they're "lit": each vertical
 * rib is treated as its own light fixture (constant color/brightness
 * along its full floor-to-ceiling height) rather than the color being a
 * soft wash smeared across a wide area. A lighting cascade fires those
 * columns outward from the one furthest upstage-center — dead center on
 * the back wall — toward the curved side walls, which on this room's
 * geometry also means toward the viewer, the way a lighting programmer
 * would chase a run of fixtures rather than fade a whole wall. Lit color
 * is applied as a mix toward its hue rather than added on top of the
 * white base, since adding brightness onto an already-white surface has
 * nowhere to go but straight back to clipped white.
 */
export const frostedGlassRoomVertexShader = /* glsl */ `
  varying vec3 vPos;

  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const frostedGlassRoomFragmentShader = /* glsl */ `
  uniform vec3 uColorBack;
  uniform vec3 uColorLeft;
  uniform vec3 uColorRight;
  uniform vec3 uColorCeiling;
  uniform vec3 uColorFloor;
  uniform float uIntensityBack;
  uniform float uIntensityLeft;
  uniform float uIntensityRight;
  uniform float uIntensityCeiling;
  uniform float uIntensityFloor;
  uniform float uHalf;
  uniform float uTime;
  uniform float uCascadePhase;
  uniform float uCascadeStrength;
  uniform float uExposure;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec3 n = vPos / uHalf; // roughly -1..1 across the room

    // Smooth "which wall am I on" weights — sharp enough that each wall
    // reads as its own color in the middle, soft enough to blend exactly
    // where the geometry itself curves into its neighbor.
    float p = 6.0;
    float wx = pow(abs(n.x), p);
    float wy = pow(abs(n.y), p);
    float wz = pow(abs(n.z), p);
    float wsum = max(wx + wy + wz, 1e-4);
    wx /= wsum; wy /= wsum; wz /= wsum;

    float sxr = smoothstep(-0.04, 0.04, n.x);
    float syr = smoothstep(-0.04, 0.04, n.y);
    float szr = smoothstep(-0.04, 0.04, n.z);

    float wRight = wx * sxr;
    float wLeft = wx * (1.0 - sxr);
    float wCeiling = wy * syr;
    float wFloor = wy * (1.0 - syr);
    // The "front" face (nearest the visitor, behind the camera) folds into
    // the back wall's color so there's never an undefined region.
    float wBack = wz * (1.0 - szr) + wz * szr;

    float wTotal = max(wRight + wLeft + wCeiling + wFloor + wBack, 1e-4);
    wRight /= wTotal; wLeft /= wTotal; wCeiling /= wTotal; wFloor /= wTotal; wBack /= wTotal;

    vec3 peakColor =
      wRight * uColorRight +
      wLeft * uColorLeft +
      wCeiling * uColorCeiling +
      wFloor * uColorFloor +
      wBack * uColorBack;
    float intensity =
      wRight * uIntensityRight +
      wLeft * uIntensityLeft +
      wCeiling * uIntensityCeiling +
      wFloor * uIntensityFloor +
      wBack * uIntensityBack;
    intensity = clamp(intensity, 0.0, 1.0);

    // Base surface: clean, neutral white at rest. Nothing below washes
    // color across a wide area of it — color only ever lands on the
    // specific fluted columns that are lit.
    vec3 base = vec3(0.96);

    // Fluted ribs — a single angle wrapped around the vertical axis, used
    // everywhere (walls, ceiling, floor alike). Because it's one smooth
    // function of position rather than several coordinates stitched
    // together at a blend boundary, the ribs turn continuously around the
    // room's curve with no seams or contour artifacts. fluteIndex is the
    // integer column id — constant along a rib's full floor-to-ceiling
    // height — so each column can be lit as one discrete fixture.
    float ribAngle = atan(vPos.x, -vPos.z);
    float fluteCount = 34.0; // ribs across the visible ~180 degree sweep
    float fluteRaw = ribAngle * fluteCount / 3.14159265;
    float fluteIndex = floor(fluteRaw);
    float fluteUv = fract(fluteRaw);
    float flute = sin(fluteUv * 3.14159265);
    float fluteShade = 1.0 + flute * 0.055;

    // Distance of this column from dead-center-back (index 0 — the point
    // furthest from the viewer), spreading out toward the curved side
    // walls. On this room's geometry that same direction also carries a
    // column physically closer to the viewer, so one 0..1 axis is enough
    // to mean "back-center out to the sides and towards the viewer."
    float fluteSpread = fluteCount * 0.5;
    float fluteNorm = clamp(abs(fluteIndex) / fluteSpread, 0.0, 1.0);

    // Lighting cascade: a single ripple front, not a repeating wave — a
    // periodic cos band here would put several lit rings on screen at
    // once, reading as multiple ripple origins instead of one. Instead
    // rippleFront is one point travelling from the back-center column
    // (0) out to the sides (1), and the cascade is a narrow band of
    // brightness centered on wherever that front currently is, so there
    // is only ever one visible point of origin. It loops back to 0 (a
    // fresh ripple starting at center again) once it reaches the sides.
    float rippleFront = fract(uCascadePhase);
    float rippleWidth = 0.16;
    float cascade = exp(-pow((fluteNorm - rippleFront) / rippleWidth, 2.0));

    // Brightness also leans on this fragment's wall-blended intensity
    // (already audio-driven per wall region above), so a lit column still
    // breathes with whichever band is driving its wall, not just the
    // cascade's position.
    float glow = cascade * clamp(uCascadeStrength * 2.4, 0.0, 1.0) * mix(0.35, 1.0, intensity);

    // Mixed toward its hue rather than added — adding light onto the
    // white base would just clip invisibly back to white. peakColor comes
    // straight from the audio-driven wall blend above, so which color
    // fires depends on what's actually playing.
    vec3 litColor = mix(vec3(1.0), peakColor, 0.88);
    vec3 color = mix(base, litColor, clamp(glow, 0.0, 1.0));
    color *= fluteShade;

    float wave = sin(ribAngle * 14.0 + uTime * 0.05) * 0.01;
    color += wave;

    float dither = (hash(vPos.xz * 60.0 + vPos.y * 13.0) - 0.5) * 0.012;
    color += dither;

    // Global exposure — pulls everything back from the white clip point so
    // loud/bright moments still have headroom to read as *brighter*
    // instead of just flattening into solid white.
    color *= uExposure;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
