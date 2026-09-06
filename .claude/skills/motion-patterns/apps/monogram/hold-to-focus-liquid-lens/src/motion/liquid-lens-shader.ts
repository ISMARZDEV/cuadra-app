/** Our bounded lens approximation, not the reference app's shader. */
export const LIQUID_LENS_SKSL = `
uniform shader image;
uniform float2 size;
uniform float strength;
uniform float boundary;
uniform float bow;
uniform float feather;
uniform float displacement;
uniform float blurRadius;
uniform float veil;
uniform float3 veilColor;

half4 main(float2 xy) {
  float nx = (xy.x / size.x - 0.5) * 2.0;
  float arch = max(0.0, 1.0 - nx * nx);
  float edge = boundary - bow * arch;
  float depth = smoothstep(edge - feather, edge + feather, xy.y);
  float rim = exp(-pow((xy.y - edge) / feather, 2.0));
  float2 uv = xy + float2(nx * displacement * rim * 0.15,
                         displacement * arch * rim);
  float radius = blurRadius * depth;
  // Fixed Gaussian-like kernel; sampled width is an approximation, not measured sigma.
  half4 color = half4(0.0);
  float total = 0.0;
  for (int y = -3; y <= 3; y++) {
    for (int x = -3; x <= 3; x++) {
      float weight = exp(-float(x * x + y * y) / 4.5);
      color += image.eval(uv + float2(float(x), float(y)) * radius * 0.5) * weight;
      total += weight;
    }
  }
  color /= total;
  color.rgb = mix(color.rgb, half3(veilColor) * color.a, veil * depth);
  return mix(image.eval(xy), color, strength);
}
`;
