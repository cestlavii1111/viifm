/**
 * Fluted frosted glass for the *whole room as one seamless surface* — used
 * with a rounded-box geometry (rendered from the inside) so there are no
 * hard seams where walls meet. Instead of five separately-colored panels,
 * every fragment blends between up to two neighboring "walls" based on
 * where it sits on the box, so color and geometry go soft at exactly the
 * same place: a Turrell-Ganzfeld-style coved room rather than a tight box.
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

    // Vertical gradient across the whole room — bright/saturated near the
    // ceiling line, fading to a pale tint near the floor.
    float t = clamp((vPos.y + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    float reach = mix(3.2, 0.7, intensity);
    float g = pow(t, reach);

    vec3 paleBottom = mix(peakColor, vec3(1.0), 0.78);
    vec3 color = mix(paleBottom, peakColor, g);

    float hot = smoothstep(0.88, 1.0, t) * intensity;
    color = mix(color, vec3(1.0), hot * 0.5);

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

    // Light-tunnel cascade: concentric bands travelling from the back wall
    // (depthN 0) toward the visitor (depthN 1) as uTunnelPhase advances —
    // like stage lighting rushing the audience on a hit rather than a
    // static wash. depthN is shared across walls/ceiling/floor, so a band
    // lights up the whole cross-section it passes through, reading as a
    // ring sweeping down the room rather than per-wall flicker.
    float depthN = clamp((vPos.z + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    float ringCount = 5.0;
    float ringPhase = depthN * ringCount - uTunnelPhase;
    float ring = pow(0.5 + 0.5 * cos(6.28318530718 * ringPhase), 2.0);
    color += ring * uTunnelStrength * mix(vec3(1.0), peakColor, 0.7);

    float dither = (hash(vPos.xz * 60.0 + vPos.y * 13.0) - 0.5) * 0.012;
    color += dither;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
