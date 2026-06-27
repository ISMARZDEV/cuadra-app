import {
  Blur,
  Canvas,
  Fill,
  Group,
  LinearGradient,
  Paint,
  Path,
  RuntimeShader,
  Skia,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// Siri-style AI orb as a 3D GLASS DROP. The wave (faithful kopiro/siriwave iOS9 port — mirrored
// additive RGB-gradient lobes over a dark base) is rendered, then a lens RuntimeShader refracts it:
// it samples the rendered wave with a dome displacement that bends the light toward the oval rim,
// adds chromatic aberration at the edge, a cool Fresnel rim, a broad top gloss and depth shading.

const GRAPH_X = 25;
const ATT = 4;
const AMP_FACTOR = 0.8;
const STEP = 0.7;
const ASPECT = 0.86; // height / width → oval (wider than tall)

type SubCurve = { amp: number; width: number; offset: number; verse: number; speed: number; ampSpeed: number; ampPhase: number };
type Band = "top" | "bottom" | "both";
type WaveColor = { a: string; b: string; dir: 1 | -1; band: Band; curves: SubCurve[] };

const COLORS: WaveColor[] = [
  {
    a: "#FBE800", b: "#B73401", dir: 1, band: "top", // warm → top
    curves: [
      { amp: 0.95, width: 1.8, offset: -2.0, verse: 1, speed: 0.90, ampSpeed: 0.70, ampPhase: 0.0 },
      { amp: 0.78, width: 1.4, offset: 0.6, verse: -1, speed: 1.08, ampSpeed: 0.50, ampPhase: 1.6 },
      { amp: 0.85, width: 2.4, offset: 2.6, verse: 1, speed: 0.82, ampSpeed: 0.62, ampPhase: 3.0 },
    ],
  },
  {
    a: "#28F6E7", b: "#0088FF", dir: -1, band: "both", // cyan/blue → central bright band
    curves: [
      { amp: 0.92, width: 1.6, offset: -2.6, verse: -1, speed: 1.02, ampSpeed: 0.55, ampPhase: 0.8 },
      { amp: 0.75, width: 2.0, offset: 0.0, verse: 1, speed: 0.88, ampSpeed: 0.66, ampPhase: 2.3 },
      { amp: 0.82, width: 1.3, offset: 2.0, verse: -1, speed: 1.14, ampSpeed: 0.50, ampPhase: 4.1 },
    ],
  },
  {
    a: "#B7FF77", b: "#357B00", dir: 1, band: "bottom", // green → bottom
    curves: [
      { amp: 0.88, width: 1.5, offset: -1.4, verse: 1, speed: 1.05, ampSpeed: 0.60, ampPhase: 1.0 },
      { amp: 0.74, width: 2.2, offset: 1.1, verse: -1, speed: 0.92, ampSpeed: 0.72, ampPhase: 2.9 },
      { amp: 0.85, width: 1.7, offset: 3.0, verse: 1, speed: 0.96, ampSpeed: 0.52, ampPhase: 5.0 },
    ],
  },
  {
    a: "#E85DE8", b: "#360076", dir: -1, band: "bottom", // magenta/purple → bottom
    curves: [
      { amp: 0.90, width: 1.7, offset: -3.0, verse: -1, speed: 0.98, ampSpeed: 0.58, ampPhase: 0.4 },
      { amp: 0.76, width: 1.3, offset: -0.4, verse: 1, speed: 1.10, ampSpeed: 0.64, ampPhase: 2.0 },
      { amp: 0.84, width: 2.1, offset: 1.6, verse: -1, speed: 0.86, ampSpeed: 0.54, ampPhase: 3.7 },
    ],
  },
];

function buildWave(wave: WaveColor, t: number, w: number, h: number) {
  "worklet";
  const b = Skia.PathBuilder.Make();
  const center = h * 0.56; // wave sits in the lower-middle (dark glass on top, like the reference)
  const heightMax = h * 0.46;
  const GAIN = 2.6;
  const WIDTH_SCALE = 3.4;
  const K = wave.curves.length;

  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    // Asymmetric: each colour only draws its band (warm top, cool bottom) → flowing wave, not an X.
    if (sign > 0 && wave.band === "bottom") continue;
    if (sign < 0 && wave.band === "top") continue;
    let first = true;
    for (let i = -GRAPH_X; i <= GRAPH_X; i += STEP) {
      let yr = 0;
      for (let ci = 0; ci < K; ci++) {
        const c = wave.curves[ci];
        const tt = 4 * (-1 + (ci / (K - 1)) * 2) + c.offset;
        const x = i / (c.width * WIDTH_SCALE) - tt;
        const amp = c.amp * (0.55 + 0.45 * Math.sin(t * c.ampSpeed + c.ampPhase));
        const a = ATT / (ATT + x * x);
        const attX = a; // broad spanning humps (not a central spike)
        yr += Math.abs(amp * Math.sin(c.verse * x - t * c.speed) * attX);
      }
      yr /= K;
      const e = ATT / (ATT + (i / GRAPH_X) * (i / GRAPH_X) * 4);
      const y = AMP_FACTOR * heightMax * GAIN * yr * (e * e);
      const px = (w * (i + GRAPH_X)) / (GRAPH_X * 2);
      const py = center - sign * y;
      if (first) {
        b.moveTo(px, py);
        first = false;
      } else {
        b.lineTo(px, py);
      }
    }
    b.close();
  }
  return b.build();
}

// Glass lens: samples the rendered wave (`image`) and refracts it inside an oval dome.
const GLASS = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 resolution;

half4 main(float2 fragCoord) {
  float2 res = resolution;
  float2 uv = fragCoord / res;
  float2 p = uv * 2.0 - 1.0;          // ellipse space (-1..1)
  float r2 = p.x * p.x + p.y * p.y;
  if (r2 > 1.0) { return half4(0.0); }
  float z = sqrt(1.0 - r2);           // dome height (1 centre → 0 rim)

  // Lens refraction: pull samples toward the rim → the wave wraps the curved edge.
  float bend = 0.24;
  float2 disp = p * (1.0 - z) * bend;
  float2 suv = uv - disp;

  // Chromatic aberration, strongest at the rim.
  float ca = 0.03 * (1.0 - z);
  half cr = image.eval((suv + p * ca) * res).r;
  half cg = image.eval(suv * res).g;
  half cb = image.eval((suv - p * ca) * res).b;
  half3 col = half3(cr, cg, cb);

  // Glass shading.
  float fres = pow(1.0 - z, 3.0);
  col += half3(0.45, 0.55, 0.85) * fres * 0.18;      // cool rim light
  float sheen = smoothstep(0.15, -0.8, p.y) * z;      // broad top gloss
  col += half3(0.90, 0.95, 1.0) * sheen * 0.10;
  col *= (0.78 + 0.22 * z);                           // depth (rim darker)

  // Thin refractive glass border (bright edge that picks up the inner colour).
  float rim = smoothstep(0.88, 0.99, r2) * (1.0 - smoothstep(0.99, 1.0, r2));
  col += half3(0.75, 0.85, 1.0) * rim * 0.35;

  float a = 1.0 - smoothstep(0.94, 1.0, r2);          // wide, anti-aliased oval edge
  return half4(col, 1.0) * a;
}
`);

export function OrbSphere({ size = 64, visible = true }: { size?: number; visible?: boolean }) {
  const clock = useClock();
  const w = size;
  const h = size * ASPECT;

  const t = useDerivedValue(() => clock.value / 1000);
  const p0 = useDerivedValue(() => buildWave(COLORS[0], t.value, w, h));
  const p1 = useDerivedValue(() => buildWave(COLORS[1], t.value, w, h));
  const p2 = useDerivedValue(() => buildWave(COLORS[2], t.value, w, h));
  const p3 = useDerivedValue(() => buildWave(COLORS[3], t.value, w, h));
  const paths = [p0, p1, p2, p3];

  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withSpring(visible ? 1 : 0, { damping: 13, stiffness: 150, mass: 0.6 });
  }, [visible, appear]);
  const containerStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.6 + appear.value * 0.4 }, { translateY: (1 - appear.value) * 12 }],
  }));

  if (!GLASS) return null;

  return (
    <Animated.View style={[{ width: w, height: h }, containerStyle]}>
      <Canvas style={{ width: w, height: h }}>
        <Group layer={
          <Paint>
            <RuntimeShader source={GLASS} uniforms={{ resolution: [w, h] }} />
          </Paint>
        }>
          {/* Dark glass body. */}
          <Fill color="rgb(7,9,14)" />
          {/* Additive RGB-gradient wave (soft glow). */}
          <Group layer={
            <Paint>
              <Blur blur={w * 0.018} />
            </Paint>
          }>
            {COLORS.map((wave, i) => (
              <Path key={i} path={paths[i]} style="fill" blendMode="plus" opacity={0.9}>
                <LinearGradient
                  start={vec(wave.dir === 1 ? 0 : w, h / 2)}
                  end={vec(wave.dir === 1 ? w : 0, h / 2)}
                  colors={[wave.a, wave.b]}
                />
              </Path>
            ))}
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
}
