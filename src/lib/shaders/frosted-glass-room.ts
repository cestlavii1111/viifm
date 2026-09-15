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
 * toward the viewer, usually lighting the *whole cross-section* at once —
 * ceiling, floor, and both side walls together — so it reads as a
 * concentric square frame rippling down the tunnel, the way the
 * reference mockup showed, rather than a single column chasing
 * sideways. Which wall regions actually take part varies pass to pass
 * (see the uCascadeMask* uniforms) so it isn't always the full ring —
 * sometimes just one side wall, or just ceiling+floor — which keeps the
 * animation from reading as one fixed, repeating shape. Color is applied
 * as a mix toward its hue rather than added on top of the white base,
 * since adding brightness onto an already-bright surface has nowhere to
 * go but straight back to clipped white.
 */
export const frostedGlassRoomVertexShader = /* glsl */ `
  // uCurveX/uCurveY are no longer a raw sideways offset — they're the X and
  // Y components of a single "how far the tunnel has turned" angle (in
  // radians), driven by the visitor's cursor (or, on mobile, finger)
  // position and eased in JS. Splitting the total turn angle into an X part
  // and a Y part (rather than one scalar angle plus a separate direction)
  // means the existing per-axis easing in JS keeps working unchanged, and
  // a diagonal cursor position naturally produces a bend around a tilted
  // axis — a single turn that's part "curving left/right" and part
  // "cresting a hill" at once, rather than the two ever needing to be
  // composed as two separate bends.
  uniform float uCurveX;
  uniform float uCurveY;
  uniform vec3 uHalf;
  varying vec3 vPos;

  void main() {
    // vPos stays the room's original, straight-tunnel coordinates — every
    // fragment-shader calculation (which wall a point belongs to, how far
    // down the tunnel it is, the panel seams) is expressed in these
    // "logical" coordinates and has no reason to change just because the
    // tunnel's actual on-screen shape is bending: the panel seams below
    // are indexed by this same (unbent) depth, so as the mesh's real,
    // bent vertex positions carry those seams along with them, the seam
    // rings themselves visibly curve along the bend — exactly the curved
    // grid-line look a bent pipe has — without the fragment shader having
    // to know anything about the bend at all.
    vPos = position;

    // The first version of this curve just slid each cross-section
    // sideways by a growing amount — cheap, but every cross-section stayed
    // flat and pointed straight ahead, so nothing about the tube's own
    // *shape* ever visibly curved; only its position on screen shifted,
    // which read as camera movement rather than the tunnel turning. A real
    // bend has to rotate each cross-section to keep facing "forward" along
    // the turn (the way a bent pipe's rings tilt to stay perpendicular to
    // the pipe), which is what makes the near/inside wall visibly swing
    // toward the viewer and the far/outside wall recede — the actual
    // signature the reference images show. The math below is a standard
    // "bend" deformation: treat the tunnel's centerline as an arc of
    // constant curvature (rather than a straight line) and place every
    // vertex at the same offset from that arc it originally had from the
    // straight centerline.
    //
    // A first version of this spread the whole turn over the tunnel's
    // full length (curvature = thetaMax / tubeLength, so radius R =
    // tubeLength / thetaMax). That's the mathematically "honest" choice,
    // but this tunnel is enormously long relative to the viewer's
    // standback (roughly 14x its own width) — so a turn gentle enough to
    // still reach the far wall in a straight tube of that length works
    // out to a radius of several hundred units, and the curvature visible
    // within the camera's near field (the only part that's ever actually
    // on screen) rounds to nothing: it measured as well under a pixel of
    // deflection even at generous standback, which is exactly why it kept
    // reading as the camera panning rather than the tunnel bending.
    //
    // Instead, the turn is concentrated into a short "bend zone" right at
    // the front of the tunnel — long enough that the camera can stand
    // back from it and still see a meaningful arc of it, short enough
    // that the same thetaMax now corresponds to a much tighter, genuinely
    // visible radius. Past the end of that zone the tube continues
    // perfectly straight along whatever direction the bend finished
    // facing — like a bent pipe elbow feeding into a long straight run —
    // so the far two-thirds of the tunnel (which the viewer barely
    // perceives as more than a converging point anyway) costs nothing
    // extra and never has to fight the bend math for numerical stability.
    //
    // The straight extension is a plain per-point translation along a
    // single shared tangent direction (same for every point regardless of
    // its radial offset r, since concentric circles share a tangent angle
    // at a given turn angle) — unlike an earlier attempt that rescaled
    // distances non-uniformly per r to "restore" full depth, which
    // diverged badly off-axis (corners overshot the intended back wall by
    // hundreds of units). Adding a fixed offset per point, instead of
    // scaling, keeps every point's true remaining distance exact.
    float thetaMax = length(vec2(uCurveX, uCurveY));
    vec2 bendDir = vec2(uCurveX, uCurveY) / max(thetaMax, 1e-5);
    // axisDir: the horizontal-plane direction the tube rotates *around*.
    // Perpendicular to bendDir so that any offset purely along axisDir
    // (e.g. straight up/down when bending left/right) sits exactly on the
    // rotation axis and is left untouched by it, same as a real pipe bend
    // only moving the cross-section within its own turning plane.
    vec2 axisDir = vec2(-bendDir.y, bendDir.x);

    // Split this vertex's cross-section offset into the component that
    // lies in the turning plane (r, along bendDir) and the component that
    // sits on the rotation axis itself and never moves (q, along axisDir).
    float r = dot(position.xy, bendDir);
    float q = dot(position.xy, axisDir);

    // sFront: distance from the front opening (0 at the front wall,
    // growing toward the back), the natural axis to measure the bend
    // zone against since it's anchored at the front where the viewer
    // stands, independent of the tunnel's total length.
    float tubeLength = 2.0 * uHalf.z;
    float sFront = uHalf.z - position.z;

    // The zone's length is a fixed fraction of the room's own
    // cross-section (not of tubeLength) — tying it to tubeLength would
    // reintroduce the "radius grows with however long the tunnel
    // happens to be" problem above; tying it to uHalf keeps the turn's
    // tightness (and how much of it the camera can actually see)
    // independent of how deep the tunnel recedes.
    float bendZoneLength = uHalf.x * 8.0;
    float zoneT = clamp(sFront / bendZoneLength, 0.0, 1.0);
    float angle = thetaMax * zoneT;
    float R = bendZoneLength / max(thetaMax, 1e-4);

    // Every point at radial offset r from the centerline sweeps its own
    // circle of radius (R - r) as the cross-section turns — very slightly
    // smaller for points on the inside of the turn than the outside,
    // which is what keeps a turning cross-section's own rings reading as
    // genuinely rotating rather than just the whole tube translating.
    float radiusAtPoint = R - r;
    float bentAlong = radiusAtPoint * sin(angle);
    float bentR = R - radiusAtPoint * cos(angle);

    // Past the zone, keep travelling in a straight line along the
    // direction the bend was last facing (shared by every r, see above)
    // for whatever distance remains.
    float extra = max(sFront - bendZoneLength, 0.0);
    bentAlong += extra * cos(thetaMax);
    bentR += extra * sin(thetaMax);

    vec3 bentPosition;
    bentPosition.x = bendDir.x * bentR + axisDir.x * q;
    bentPosition.y = bendDir.y * bentR + axisDir.y * q;
    bentPosition.z = uHalf.z - bentAlong;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(bentPosition, 1.0);
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
  // Which wall regions the current cascade actually lights up. The ripple
  // used to always light the whole cross-section together (ceiling, floor,
  // and both sides at once) every single pass, which — however smooth any
  // one pass looked — reads as repetitive over time since every cycle is
  // the same shape. These let a given pass instead favor just one side
  // wall, or just ceiling+floor, occasionally, so the room feels like it's
  // choosing where to shine rather than looping one fixed pattern. The back
  // wall (the ripple's origin, at the vanishing point) always stays lit.
  // Values are smoothed in JS before arriving here, so a change of mode
  // between passes fades rather than pops.
  uniform float uCascadeMaskLeft;
  uniform float uCascadeMaskRight;
  uniform float uCascadeMaskCeiling;
  uniform float uCascadeMaskFloor;
  // How far the painted panel pattern has scrolled, in panel widths — see
  // where it's used below. This (not real camera travel through the
  // room) is what makes the tunnel read as endless.
  uniform float uDepthScroll;
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
    // Panel count scales with the tunnel's depth (see CubeRoom's DEPTH) so
    // each frame stays roughly the same physical size rather than
    // stretching thinner every time the tunnel gets longer. Raised again
    // alongside DEPTH so the tunnel keeps reading as many frames receding
    // all the way to the point, instead of a run of frames giving way to
    // one flat, featureless square near the end.
    float panelCount = 60.0; // nested square frames down the tunnel
    // Subtracting the accumulated scroll shifts each panel boundary toward
    // higher depthN (toward the viewer) as time passes — the rings appear
    // to originate at the vanishing point and travel outward past the
    // visitor, exactly like flying forward down an endless hallway of
    // painted rings. Since it only ever feeds a fract(), there's no
    // travel limit and no seam to hide: the loop is inherent, not a reset.
    float panelRaw = depthN * panelCount - uDepthScroll;
    float panelUv = fract(panelRaw);
    float panel = sin(panelUv * 3.14159265);
    // Seam contrast is boosted toward the back of the tunnel (low depthN)
    // so the nested frames stay individually readable even as the
    // depth-darkening below dims that whole region — otherwise the panels
    // furthest back would lose their seams into one flat dark square well
    // before actually reaching the vanishing point. Raised (was 0.16/0.06)
    // so the rings read clearly enough to actually show the cursor-driven
    // bend's curvature against, not just add a faint texture.
    float panelContrast = mix(0.30, 0.13, depthN);
    float panelShade = 1.0 + panel * panelContrast;

    // Longitudinal seams: the rings above only trace *cross-sections*, so
    // a bend only ever shows up as each ring tilting slightly — nowhere
    // near as legible as lines that actually run the tunnel's length and
    // visibly arc with it. Adding a second, perpendicular set of seams
    // (evenly spaced across whichever wall a fragment is on) gives the
    // bend real lines to curve along, the same way the ceiling/floor
    // stripes in a bent-pipe reference photo reveal its curve. Picks the
    // wall's own in-surface "across" coordinate — y on the side walls, x
    // on ceiling/floor/back — rather than always using world x, so the
    // stripes run correctly along each wall rather than smearing through
    // corners.
    float crossCoord = (wx > wy && wx > wz) ? vPos.y : vPos.x;
    float crossSpacing = uHalf.x / 3.0;
    float crossUv = fract(crossCoord / crossSpacing);
    float crossPanel = sin(crossUv * 3.14159265);
    float crossContrast = mix(0.20, 0.09, depthN);
    panelShade += crossPanel * crossContrast;

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
    // Exponent eased (1.6 -> 1.2) and scale raised (1.45 -> 1.7, cap
    // 0.97 -> 1.0) — at 1.6/1.45 a typical, moderately loud passage (not
    // just the rare loudest peak) still only reached roughly half
    // coverage, which combined with satDepth's own dilution below left
    // most of what's actually on screen most of the time (the near-viewer
    // walls, which fill most of the frame) reading as pastel rather than
    // "mostly colorful" the way the room is meant to.
    float ambient = clamp(pow(intensity, 1.2) * 1.7, 0.0, 1.0);
    // Saturation itself now deepens toward the vanishing point instead of
    // staying fixed everywhere — a flat 0.75 mix-toward-white read as
    // pastel/washed-out across the whole tunnel rather than matching the
    // reference mockup's richly saturated core fading out to soft color at
    // the viewer's end. depthN is 0 at the back (the point) and 1 at the
    // viewer, so this pushes hard toward full color as depthN falls.
    // Floor raised twice now (0.55 -> 0.78 -> 0.9) — even "soft color near
    // the viewer" was still reading as washed-out/pastel rather than just
    // gently softer than the tunnel's saturated core, and the near-viewer
    // walls are most of what's actually on screen at any given moment.
    float satDepth = mix(0.9, 1.0, 1.0 - depthN);
    vec3 ambientColor = mix(vec3(1.0), peakColor, satDepth);
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
    // Distance from the ripple's current front, wrapped so the tunnel reads
    // as one continuous loop rather than a seam: without wrapping, a ripple
    // approaching the viewer (depthN -> 1) while the next one is just
    // starting at the back (front just reset to ~0) would measure as *far*
    // apart even though visually the old one is fading right as a new one
    // begins — that mismatch is what made the fade at the front and the
    // build at the back feel like two disconnected, sharp-edged events
    // instead of one gentle cycle.
    float rippleFront = fract(uCascadePhase);
    float delta = depthN - rippleFront;
    delta -= floor(delta + 0.5);
    float cascade = exp(-pow(delta / uCascadeWidth, 2.0));
    // A hard clamp here let the Gaussian's peak flatten into a plateau
    // whenever strength pushed past ~0.42 — the ripple would sit pinned at
    // full brightness across its center and then drop off abruptly at the
    // shoulders, reading as a sharp edge rather than a smooth swell. A soft
    // exponential saturation approaches full brightness gradually instead,
    // so even a strong hit still tapers gently in and out.
    float amp = 1.0 - exp(-uCascadeStrength * 2.4);
    // Gate the ripple by which wall region this fragment mostly belongs to.
    // wLeft/wRight/wCeiling/wFloor/wBack already sum to ~1 and blend smoothly
    // across corners, so multiplying by them here keeps that same smooth
    // blend at the seam between a masked-out wall and its lit neighbor,
    // rather than introducing a new hard boundary.
    float wallMask = wLeft * uCascadeMaskLeft + wRight * uCascadeMaskRight +
      wCeiling * uCascadeMaskCeiling + wFloor * uCascadeMaskFloor + wBack;
    float glow = cascade * amp * mix(0.7, 1.3, intensity) * wallMask;

    // Mixed toward its hue rather than added — adding light onto an
    // already-bright base would just clip back to white. peakColor comes
    // straight from the audio-driven wall blend above, so which color
    // fires depends on what's actually playing.
    vec3 litColor = mix(vec3(1.0), peakColor, max(satDepth, 0.95));
    // Same reasoning as amp above: a hard clamp(glow, 0, 1) here would slice
    // the top off the mix factor whenever glow crept past 1.0 (it can, via
    // the mix(0.7, 1.3, intensity) headroom multiplier above), producing a
    // visible flat-topped hot spot with sharp shoulders. Softening it the
    // same way keeps the brightest moment of the ripple gently rounded.
    color = mix(color, litColor, 1.0 - exp(-glow));
    color *= panelShade;

    // The vanishing point was reading as one flat, evenly-bright square
    // rather than a small point receding into the distance — nothing made
    // it recede visually, only the geometry's own perspective. Dimming the
    // back stretch of the tunnel (low depthN) gives it real depth: the far
    // end fades down into a small, dim point instead of glowing exactly as
    // bright as the walls right in front of the viewer.
    float depthDarken = mix(0.4, 1.0, smoothstep(0.0, 0.4, depthN));
    color *= depthDarken;

    float wave = sin(panelRaw * 3.0 + uTime * 0.05) * 0.01;
    color += wave;

    float dither = (hash(vPos.xz * 60.0 + vPos.y * 13.0) - 0.5) * 0.012;
    color += dither;

    // Global exposure — pulls everything back from the white clip point so
    // loud/bright moments still have headroom to read as *brighter*
    // instead of just flattening into solid white. Nudged back up
    // (0.92 -> 1.0) alongside the saturation increases above — at 0.92 the
    // extra saturation still read a touch dim/muted rather than vivid.
    color *= uExposure;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
