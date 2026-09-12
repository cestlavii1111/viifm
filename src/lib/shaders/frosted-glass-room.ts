/**
 * Frosted glass for the *whole room as one seamless surface* — used with a
 * square-tunnel geometry (sharp-cornered, rendered from the inside) so it
 * reads as a tunnel of square frames receding back rather than a rounded
 * chamber. Every fragment blends between up to two neighboring "walls"
 * based on where it sits on the box, with the blend pulled in tight to the
 * room's real (now sharp) edges so corners read as crisp squares, not soft
 * curves.
 *
 * The surface texture itself is built the same way: thin square panel
 * seams nested back to front by depth, shared across ceiling, floor and
 * both side walls at a given depth, so each seam reads as one continuous
 * square outline (a shallow "cube" shell) rather than fluted ribs
 * radiating around a curve. That radial rib pattern — this shader's
 * previous texture — read as its own dome/onion illusion no matter how
 * sharp the room's actual corners were, since spokes converging on a
 * central axis look round regardless of the silhouette they sit inside.
 *
 * The surface itself is a neutral white — like a cyclorama in a
 * photo/video studio — and stays that way at rest, in silence. Once the
 * track is actually playing, an ambient wash (tied to the same
 * per-wall, per-band intensity driving everything else) colors the
 * whole surface so the room reads as mostly colorful rather than mostly
 * white with a thin band running through it. On top of that, a lighting
 * cascade rides through as the room's one moving highlight: a single
 * ripple travels from the back wall (furthest from the viewer) out
 * toward the viewer, lighting the *whole cross-section* at once —
 * ceiling, floor, and both side walls together — so it reads as a
 * concentric square frame rippling down the tunnel, the way the
 * reference mockup showed, rather than a single column chasing
 * sideways. Color is applied as a mix toward its hue rather than added
 * on top of the white base, since adding brightness onto an
 * already-bright surface has nowhere to go but straight back to clipped
 * white.
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
  // The room's half-extent per axis — x/y (cross-section) and z (depth)
  // are deliberately different, not a single scalar: the tunnel is much
  // longer than it is wide, which is what makes the square frames
  // actually shrink toward a vanishing point instead of the room reading
  // as one big flat square (a cube viewed from just inside one face barely
  // shows its far wall as smaller at all).
  uniform vec3 uHalf;
  uniform float uTime;
  uniform float uCascadePhase;
  uniform float uCascadeStrength;
  uniform float uCascadeWidth;
  uniform float uExposure;
  varying vec3 vPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec3 n = vPos / uHalf; // roughly -1..1 across the room

    // Smooth "which wall am I on" weights — sharp enough that each wall
    // reads as its own color in the middle, soft enough not to show a
    // hard seam. This used to be tuned to blend exactly where the old,
    // heavily-rounded geometry curved into its neighbor; now that the
    // room is a sharp-cornered square tunnel, that same blend width would
    // sit far wider than the actual (near-zero) physical corner, which is
    // exactly what would make crisp square corners read as soft/rounded
    // again in color even though the mesh itself is sharp. A much higher
    // power pulls the color transition back in to hug the real edge.
    float p = 18.0;
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

    // Base surface: clean, neutral white at rest.
    vec3 base = vec3(0.96);

    // Distance from the back wall (0, furthest from the viewer) to right
    // at the viewer (1). Driving both the paneling below and the cascade
    // further down on this instead of angle means a given moment lights
    // (or ridges) the *whole* cross section together — ceiling, floor,
    // and both side walls at once — which on a square tunnel reads as a
    // concentric square frame, matching the reference. Angle alone always
    // read as spokes radiating from a central vertical axis, which is its
    // own dome/onion illusion no matter how sharp the room's actual
    // corners are.
    float depthN = clamp((vPos.z + uHalf.z) / (2.0 * uHalf.z), 0.0, 1.0);

    // Panel structure: the tunnel is built from a series of thin square
    // frames nested back to front — each one a shallow "cube" shell you
    // can see the seam of — rather than fluted ribs radiating around a
    // curve. panelIndex is the integer frame id, shared across ceiling,
    // floor and both side walls at a given depth, so a seam reads as one
    // continuous square outline instead of per-wall texture.
    float panelCount = 22.0; // nested square frames down the tunnel
    float panelRaw = depthN * panelCount;
    float panelUv = fract(panelRaw);
    float panel = sin(panelUv * 3.14159265);
    float panelShade = 1.0 + panel * 0.06;

    // Ambient wash: color the whole surface carries just from how
    // energetic the moment is, independent of the travelling ripple. At
    // rest (silence, or the track just starting) intensity is near zero
    // and this stays clean white; once the track is actually playing the
    // room should read as mostly colorful, not mostly white with a thin
    // band running through it. Still driven by the same per-wall,
    // per-band intensity as everything else, so different areas keep
    // leaning on whichever frequency band feeds them. Raised to a power
    // instead of scaled linearly so quiet/moderate moments sit noticeably
    // dimmer and only build toward full color as intensity really climbs —
    // a straight linear scale kept the room looking similarly colorful
    // most of the time, which read as static rather than responsive.
    float ambient = clamp(pow(intensity, 1.6) * 1.35, 0.0, 0.92);
    vec3 ambientColor = mix(vec3(1.0), peakColor, 0.75);
    vec3 color = mix(base, ambientColor, ambient);

    // Lighting cascade: a single ripple front, not a repeating wave — a
    // periodic cos band here would put several lit rings on screen at
    // once, reading as multiple ripple origins instead of one. rippleFront
    // is one point travelling from the back wall (0) out to the viewer
    // (1), and the cascade is a band of brightness centered on wherever
    // that front currently is, so there is only ever one visible ring at
    // a time. It loops back to 0 (a fresh ripple starting at the back
    // again) once it reaches the viewer. This rides on top of the ambient
    // wash above as the room's one moving highlight, rather than being
    // the only source of color — so there's no gap of bare white either
    // ahead of it or behind it. Its width is no longer a fixed constant —
    // uCascadeWidth swells on a hit, so the ripple visibly thickens as it
    // passes rather than only changing brightness/speed.
    float rippleFront = fract(uCascadePhase);
    float cascade = exp(-pow((depthN - rippleFront) / uCascadeWidth, 2.0));
    float glow = cascade * clamp(uCascadeStrength * 2.4, 0.0, 1.0) * mix(0.7, 1.3, intensity);

    // Mixed toward its hue rather than added — adding light onto an
    // already-bright base would just clip back to white. peakColor comes
    // straight from the audio-driven wall blend above, so which color
    // fires depends on what's actually playing.
    vec3 litColor = mix(vec3(1.0), peakColor, 0.95);
    color = mix(color, litColor, clamp(glow, 0.0, 1.0));
    color *= panelShade;

    float wave = sin(panelRaw * 3.0 + uTime * 0.05) * 0.01;
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
