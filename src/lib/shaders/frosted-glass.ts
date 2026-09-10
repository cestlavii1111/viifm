/**
 * Fluted/reeded frosted glass, lit from a hidden strip along the panel's
 * top edge: color is vivid and near-white right at the top, and fades to a
 * pale, barely-tinted haze toward the bottom — like light diffusing down
 * through a tall glass panel rather than glowing from a center point. Fine
 * vertical ribbing (the "flutes") gives it texture even when the color
 * itself is calm.
 */
export const frostedGlassVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const frostedGlassFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    float intensity = clamp(uIntensity, 0.0, 1.0);

    // Vertical gradient — saturated color near the top edge, desaturating
    // to a pale tint toward the bottom. Louder/more energetic moments let
    // the saturated color reach further down the panel.
    float reach = mix(3.2, 0.7, intensity);
    float g = pow(clamp(vUv.y, 0.0, 1.0), reach);

    // A pale, low-saturation tint of the wall's own color at the bottom —
    // never flat white regardless of hue, but still reads as "faded out."
    vec3 paleBottom = mix(uColor, vec3(1.0), 0.78);
    vec3 color = mix(paleBottom, uColor, g);

    // A thin near-white seam right at the very top edge, like the light
    // fixture itself diffusing through the glass closest to it.
    float hot = smoothstep(0.88, 1.0, vUv.y) * intensity;
    color = mix(color, vec3(1.0), hot * 0.5);

    // Fluted / reeded glass: fine vertical ribs, each shaded like a thin
    // rounded column catching light unevenly along its curve. A higher
    // count with gentler contrast reads as smooth from a distance while
    // still catching texture up close.
    float fluteCount = 130.0;
    float fluteUv = fract(vUv.x * fluteCount);
    float flute = sin(fluteUv * 3.14159265);
    float fluteShade = 0.94 + flute * 0.06;
    color *= fluteShade;

    // A slightly wider, softer secondary ripple so the flutes don't read
    // as perfectly mechanical.
    float wave = sin(vUv.x * 9.0 + uTime * 0.05) * 0.01;
    color += wave;

    // A whisper of dither to keep the gradient from banding.
    float dither = (hash(vUv * 800.0) - 0.5) * 0.012;
    color += dither;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
