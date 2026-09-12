/**
 * Fluted frosted glass for the *whole room as one seamless surface* — used
 * with a rounded-box geometry (rendered from the inside) so there are no
 * hard seams where walls meet. Instead of five separately-colored panels,
 * every fragment blends between up to two neighboring "walls" based on
 * where it sits on the box, so color and geometry go soft at exactly the
 * same place: a Turrell-Ganzfeld-style coved room rather than a tight box.
 *
 * The surface itself is a neutral white — like a cyclorama in a
 * photo/video studio — and color arrives only as *light*: a wash bleeding
 * in from the ceiling and floor seams, and the traveling tunnel bands.
 * That light is applied as a mix toward its color rather than added on
 * top of the base, since adding brightness onto an already-white surface
 * has nowhere to go but straight back to clipped white.
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
  uniform float uTunnelPhase;
  uniform float uTunnelStrength;
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

    // Base surface: clean, neutral white. Everything else in this shader
    // is *light* landing on it, not a tint baked into the material.
    vec3 base = vec3(0.96);

    // Colored wash bleeding in from the ceiling and floor seams — like
    // colored top-light and uplight on a white cyc — strongest right at
    // the seams and fading to clean white through the middle of the wall.
    // Louder/more energetic moments (higher intensity) let the wash reach
    // further from each seam.
    float t = clamp((vPos.y + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    float topReach = mix(0.82, 0.35, intensity);
    float floorReach = mix(0.88, 0.45, intensity);
    float topWash = pow(smoothstep(topReach, 1.0, t), 1.4) * intensity;
    float floorWash = pow(smoothstep(floorReach, 0.0, t), 1.4) * intensity * 0.8;
    vec3 color = mix(base, peakColor, clamp(topWash + floorWash, 0.0, 0.88));

    // A brighter, more saturated hot-spot right at the ceiling line — the
    // "fixture" the light reads as coming from — without blowing to solid
    // white the way a straight white-mix did.
    float hot = smoothstep(0.88, 1.0, t) * intensity;
    vec3 hotColor = mix(peakColor, vec3(1.0), 0.4);
    color = mix(color, hotColor, hot * 0.55);

    // Fluted ribs — a single angle wrapped around the vertical axis, used
    // everywhere (walls, ceiling, floor alike). Because it's one smooth
    // function of position rather than several coordinates stitched
    // together at a blend boundary, the ribs turn continuously around the
    // room's curve with no seams or contour artifacts.
    float ribAngle = atan(vPos.x, -vPos.z);
    float fluteCount = 34.0; // ribs across the visible ~180 degree sweep
    float fluteUv = fract(ribAngle * fluteCount / 3.14159265);
    float flute = sin(fluteUv * 3.14159265);
    float fluteShade = 1.0 + flute * 0.055;
    color *= fluteShade;

    float wave = sin(ribAngle * 14.0 + uTime * 0.05) * 0.01;
    color += wave;

    // Light-tunnel cascade: concentric colored bands travelling from the
    // back wall (depthN 0) toward the visitor (depthN 1) as uTunnelPhase
    // advances — like a colored light rig sweeping down a white cyc,
    // rather than a static wash. depthN is shared across walls/ceiling/
    // floor, so a band lights up the whole cross-section it passes
    // through, reading as a ring sweeping down the room rather than
    // per-wall flicker. Mixed toward its color rather than added — adding
    // light onto the white base would just clip invisibly back to white.
    float depthN = clamp((vPos.z + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    float ringCount = 5.0;
    float ringPhase = depthN * ringCount - uTunnelPhase;
    float ring = pow(0.5 + 0.5 * cos(6.28318530718 * ringPhase), 2.0);
    vec3 ringColor = mix(vec3(1.0), peakColor, 0.85);
    color = mix(color, ringColor, ring * clamp(uTunnelStrength * 1.8, 0.0, 0.9));

    float dither = (hash(vPos.xz * 60.0 + vPos.y * 13.0) - 0.5) * 0.012;
    color += dither;

    // Global exposure — pulls everything back from the white clip point so
    // loud/bright moments still have headroom to read as *brighter*
    // instead of just flattening into solid white.
    color *= uExposure;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
