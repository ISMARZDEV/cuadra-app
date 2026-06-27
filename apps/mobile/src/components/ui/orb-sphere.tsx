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
import { useEffect, useMemo, useRef } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useOrbStore } from "@/store/orb-store";

// Siri-style AI orb as a 3D GLASS DROP (pure Skia → smooth, anti-aliased edges). The wave is a
// faithful kopiro/siriwave (iOS9) port — additive RGB-gradient lobes, asymmetric (warm top / cool
// bottom), broad flowing waves. A lens RuntimeShader refracts it inside an oval dome: dome
// displacement bends light toward the rim + chromatic aberration + gloss + a thin refractive rim.
const GRAPH_X = 25;
const ATT = 4;
const AMP_FACTOR = 0.8;
const STEP = 0.7;
const ASPECT = 0.85;

type SubCurve = { amp: number; width: number; offset: number; verse: number; speed: number; ampSpeed: number; ampPhase: number };
type Band = "top" | "bottom" | "both";
type WaveColor = { a: string; b: string; dir: 1 | -1; band: Band; curves: SubCurve[] };

const COLORS: WaveColor[] = [
  {
    a: "#FBE800", b: "#B73401", dir: 1, band: "top",
    curves: [
      { amp: 0.95, width: 1.8, offset: -2.0, verse: 1, speed: 0.90, ampSpeed: 0.70, ampPhase: 0.0 },
      { amp: 0.78, width: 1.4, offset: 0.6, verse: -1, speed: 1.08, ampSpeed: 0.50, ampPhase: 1.6 },
      { amp: 0.85, width: 2.4, offset: 2.6, verse: 1, speed: 0.82, ampSpeed: 0.62, ampPhase: 3.0 },
    ],
  },
  {
    a: "#28F6E7", b: "#0088FF", dir: -1, band: "both",
    curves: [
      { amp: 0.92, width: 1.6, offset: -2.6, verse: -1, speed: 1.02, ampSpeed: 0.55, ampPhase: 0.8 },
      { amp: 0.75, width: 2.0, offset: 0.0, verse: 1, speed: 0.88, ampSpeed: 0.66, ampPhase: 2.3 },
      { amp: 0.82, width: 1.3, offset: 2.0, verse: -1, speed: 1.14, ampSpeed: 0.50, ampPhase: 4.1 },
    ],
  },
  {
    a: "#B7FF77", b: "#357B00", dir: 1, band: "bottom",
    curves: [
      { amp: 0.88, width: 1.5, offset: -1.4, verse: 1, speed: 1.05, ampSpeed: 0.60, ampPhase: 1.0 },
      { amp: 0.74, width: 2.2, offset: 1.1, verse: -1, speed: 0.92, ampSpeed: 0.72, ampPhase: 2.9 },
      { amp: 0.85, width: 1.7, offset: 3.0, verse: 1, speed: 0.96, ampSpeed: 0.52, ampPhase: 5.0 },
    ],
  },
  {
    a: "#E85DE8", b: "#360076", dir: -1, band: "bottom",
    curves: [
      { amp: 0.90, width: 1.7, offset: -3.0, verse: -1, speed: 0.98, ampSpeed: 0.58, ampPhase: 0.4 },
      { amp: 0.76, width: 1.3, offset: -0.4, verse: 1, speed: 1.10, ampSpeed: 0.64, ampPhase: 2.0 },
      { amp: 0.84, width: 2.1, offset: 1.6, verse: -1, speed: 0.86, ampSpeed: 0.54, ampPhase: 3.7 },
    ],
  },
];

function buildWave(wave: WaveColor, t: number, level: number, w: number, h: number) {
  "worklet";
  const b = Skia.PathBuilder.Make();
  // Each band crosses the centre line a little so warm/cool overlap and blend (no dark seam).
  const OVERLAP = h * 0.02;
  let center = h * 0.6;
  if (wave.band === "top") center += OVERLAP;
  else if (wave.band === "bottom") center -= OVERLAP;
  const heightMax = h * 0.5;
  const GAIN = 3.6;
  const WIDTH_SCALE = 4.4; // broad, flowing waves
  const K = wave.curves.length;

  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
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
        yr += Math.abs(amp * Math.sin(c.verse * x - t * c.speed) * a);
      }
      yr /= K;
      const e = ATT / (ATT + (i / GRAPH_X) * (i / GRAPH_X) * 4);
      const y = AMP_FACTOR * heightMax * GAIN * level * yr * (e * e);
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

// Glass lens: samples the rendered wave (`image`) and refracts it inside the oval dome.
const GLASS = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 resolution;

half4 main(float2 fragCoord) {
  float2 res = resolution;
  float2 uv = fragCoord / res;
  float2 p = uv * 2.0 - 1.0;
  // Superellipse → iOS-style squircle (continuous-curvature "corner smoothing").
  float N = 2.2;
  float se = pow(pow(abs(p.x), N) + pow(abs(p.y), N), 1.0 / N);
  if (se > 1.0) { return half4(0.0); }
  float s2 = se * se;
  float z = sqrt(max(0.0, 1.0 - s2));

  float bend = 0.22;
  float2 suv = uv - p * (1.0 - z) * bend;
  float ca = 0.03 * (1.0 - z);

  half4 sc = image.eval(suv * res);
  half cr = image.eval((suv + p * ca) * res).r;
  half cb = image.eval((suv - p * ca) * res).b;
  half3 col = half3(cr, sc.g, cb);

  // Glass highlights fade out toward the TOP so the black cap stays pure black (no coloured rim).
  float lower = smoothstep(-0.6, 0.8, p.y); // 0 at top → 1 lower half

  float fres = pow(1.0 - z, 3.0);
  col += half3(0.45, 0.55, 0.85) * fres * 0.18 * lower;
  float sheen = smoothstep(0.15, -0.8, p.y) * z;
  col += half3(0.90, 0.95, 1.0) * sheen * 0.06;
  col *= (0.78 + 0.22 * z);

  // Soft refractive glass border (wide → smooth), only on the lower half.
  float rim = smoothstep(0.80, 0.95, s2) * (1.0 - smoothstep(0.95, 1.0, s2)) * lower;
  col += half3(0.75, 0.85, 1.0) * rim * 0.35;

  // Preserve sampled alpha (translucent body); the smooth rim carries the lower edge → no jaggies.
  float edge = 1.0 - smoothstep(0.84, 1.0, s2);
  float a = clamp(sc.a + rim * 0.55, 0.0, 1.0) * edge;
  return half4(col, a);
}
`);

export function OrbSphere({ size = 64, visible = true }: { size?: number; visible?: boolean }) {
  const clock = useClock();
  const w = size;
  const h = size * ASPECT;
  const PAD = size * 0.35; // room around the orb for the glow bloom
  const CW = w + PAD * 2;
  const CH = h + PAD * 2;

  const t = useDerivedValue(() => clock.value / 1000);
  const level = useSharedValue(0.6); // wave energy (idle ≈ 0.6, swells on tap)
  const p0 = useDerivedValue(() => buildWave(COLORS[0], t.value, level.value, w, h));
  const p1 = useDerivedValue(() => buildWave(COLORS[1], t.value, level.value, w, h));
  const p2 = useDerivedValue(() => buildWave(COLORS[2], t.value, level.value, w, h));
  const p3 = useDerivedValue(() => buildWave(COLORS[3], t.value, level.value, w, h));
  const paths = [p0, p1, p2, p3];

  // Tap → swell the wave then settle (water-style: quick rise, slow ease back).
  const pulse = useOrbStore((s) => s.pulse);
  useEffect(() => {
    if (pulse === 0) return;
    level.value = withSequence(
      withTiming(1.45, { duration: 300, easing: Easing.out(Easing.quad) }),
      withTiming(0.6, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
    );
  }, [pulse, level]);

  // Squircle outline for the lower rim glow (matches the superellipse body).
  const ringPath = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    const Np = 4.5;
    const cx = PAD + w / 2;
    const cy = PAD + h / 2;
    const rx = w / 2 - 1;
    const ry = h / 2 - 1;
    const STEPS = 72;
    for (let k = 0; k <= STEPS; k++) {
      const ang = (k / STEPS) * Math.PI * 2;
      const ct = Math.cos(ang);
      const st = Math.sin(ang);
      const px = cx + rx * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / Np);
      const py = cy + ry * Math.sign(st) * Math.pow(Math.abs(st), 2 / Np);
      if (k === 0) pb.moveTo(px, py);
      else pb.lineTo(px, py);
    }
    pb.close();
    return pb.build();
  }, [w, h, PAD]);

  // Animation is split into three channels (opacity / scale / translateY) for independent control.
  const op = useSharedValue(visible ? 1 : 0); // opacity
  const sc = useSharedValue(visible ? 1 : 0.5); // scale
  const ty = useSharedValue(visible ? 0 : 16); // translateY (px); + = down, toward the navbar
  const mounted = useRef(false);
  useEffect(() => {
    // On first run just snap to the resting state — never animate on mount (would flash the orb in).
    if (!mounted.current) {
      mounted.current = true;
      op.value = visible ? 1 : 0;
      sc.value = visible ? 1 : 0.5;
      ty.value = visible ? 0 : 16;
      return;
    }
    if (visible) {
      // ENTRANCE — reset to the small/low start while still invisible (op is 0 now, so the snap is
      // never seen), then pop up with a juicy under-damped bounce (overshoots past 1).
      sc.value = 0.5;
      ty.value = 16;
      op.value = withTiming(1, { duration: 120 });
      sc.value = withSpring(1, { damping: 5.5, stiffness: 175, mass: 0.9, overshootClamping: false });
      ty.value = withSpring(0, { damping: 6.5, stiffness: 190, mass: 0.85, overshootClamping: false });
    } else {
      // EXIT — the exact INVERSE of the entrance (same springs), targeting the hidden rest state:
      // shrink back to 0.5, sink the 16px back down toward the logo, and fade out. Because it mirrors
      // the appear it stays in the orb's home spot and never overlaps the bar / the tab icons.
      op.value = withTiming(0, { duration: 120 });
      sc.value = withSpring(0.5, { damping: 5.5, stiffness: 175, mass: 0.9, overshootClamping: false });
      ty.value = withSpring(16, { damping: 6.5, stiffness: 190, mass: 0.85, overshootClamping: false });
    }
  }, [visible, op, sc, ty]);
  const containerStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: sc.value }, { translateY: ty.value }],
  }));

  if (!GLASS) return null;

  return (
    <Animated.View style={[{ width: w, height: h }, containerStyle]}>
      {/* Soft animated colour bloom — a heavily-blurred, faint copy of the wave behind the orb,
          so the glow follows the wave's colours and motion (subtle). */}
      <Canvas style={{ position: "absolute", left: -PAD, top: -PAD, width: CW, height: CH }}>
        <Group
          transform={[{ translateX: PAD }, { translateY: PAD }]}
          layer={
            <Paint>
              <Blur blur={size * 0.16} />
            </Paint>
          }
        >
          {COLORS.map((wave, i) => (
            <Path key={i} path={paths[i]} style="fill" blendMode="plus" opacity={0.42}>
              <LinearGradient
                start={vec(wave.dir === 1 ? 0 : w, h / 2)}
                end={vec(wave.dir === 1 ? w : 0, h / 2)}
                colors={[wave.a, wave.b]}
              />
            </Path>
          ))}
        </Group>
        {/* Small soft glow hugging the rim so the edge doesn't cut off abruptly. */}
        <Group layer={
          <Paint>
            <Blur blur={size * 0.09} />
          </Paint>
        }>
          <Path path={ringPath} style="stroke" strokeWidth={size * 0.1}>
            {/* Transparent at the top so the black cap has no rim glow; light toward the bottom. */}
            <LinearGradient
              start={vec(0, PAD)}
              end={vec(0, PAD + h)}
              positions={[0, 0.45, 1]}
              colors={["rgba(170,200,255,0)", "rgba(170,200,255,0)", "rgba(170,200,255,0.55)"]}
            />
          </Path>
        </Group>
      </Canvas>

      <Canvas style={{ width: w, height: h }}>
        <Group layer={
          <Paint>
            <RuntimeShader source={GLASS} uniforms={{ resolution: [w, h] }} />
          </Paint>
        }>
          {/* Glass body: opaque BLACK on top → translucent toward the bottom (app shows through). */}
          <Fill>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, h)}
              positions={[0, 0.52, 0.8, 1]}
              colors={["rgba(2,2,5,1.0)", "rgba(3,4,8,1.0)", "rgba(8,10,16,0.45)", "rgba(11,14,21,0.24)"]}
            />
          </Fill>
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
