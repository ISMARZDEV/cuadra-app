import {
  Blur,
  Canvas,
  Circle,
  ColorMatrix,
  Fill,
  Group,
  Turbulence,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import { type LayoutChangeEvent, View, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Aquatic "aurora" backdrop (Cleo-style), theme-aware:
//   • light → the bright brand limes pop cleanly on the off-white card bg.
//   • dark  → deeper emerald/teal greens that GLOW softly behind the near-black glass; the pure limes
//     read neon and clip to white under the blur, so we go richer + more aquatic (UX call).
// The blobs overlap under blendMode="screen": where two greens meet they ADD and brighten toward
// cyan-white — that's the luminous aurora core in the reference shots, not flat discs.
const LIGHT_A = "#8EF33A"; // brand lime
const LIGHT_B = "#C3FA7E"; // pale lime
const LIGHT_CORE = "#E6FFB0"; // pale lime hotspot
// Dark mode rides much deeper now: the base is a near-black teal so the aurora EMERGES from the dark
// (ref shot 4) instead of glowing bright green. Under blendMode="screen" a near-black source adds
// almost nothing, so #001410 stays a whisper; the mid teal + the emerald core carry the visible glow.
const DARK_A = "#001410"; // near-black deep teal — the base the aurora rises out of
const DARK_B = "#0B5A42"; // deep teal — the visible-but-restrained glow
const DARK_CORE = "#1FAE7C"; // emerald hotspot (no longer neon cyan)

// Luminance desaturate — turns the RGBA turbulence into gray film grain (alpha kept).
const GRAIN_DESATURATE = [
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0, 0, 0, 1, 0,
];

type Knobs = {
  /** Layer intensity. Lower = whisper-soft. Default: 0.45 light / 0.35 dark. */
  opacity?: number;
  /** Skia blur radius — the higher, the more liquid/diffuse. Default 60. */
  blur?: number;
  /** Base drift period (ms); the blobs scale off it. Default 9000. */
  durationMs?: number;
  /** Blob radius as a fraction of screen width. Default 0.62. */
  r?: number;
  /** Filmic grain overlay (kills banding, adds premium texture). Default true. */
  grain?: boolean;
};

// Subtle animated aurora: brand-green blobs drift slowly, heavily blurred by Skia so they read as
// liquid. Mounted as an absoluteFill BEHIND the chat card (so the card's glass refracts it and it
// bleeds softly around the card's margins). Skia v2 + reanimated v4: shared/derived values go straight
// to Skia props (no useValue/useClock). The whole layer is low-opacity and pointerEvents="none" so it
// never interferes with the chat.
export function ChatLavaBackground({
  opacity,
  blur = 60,
  durationMs = 9000,
  r = 0.62,
  grain = true,
}: Knobs = {}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();

  // Canvas size (set on layout). Blobs are normalized to it so the layout drives everything.
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);

  // Each blob gets an independent rise phase (Y) and sway phase (X), both ping-ponging 0↔1 at
  // DIFFERENT periods. Combining two reversing timings linearly gives organic Lissajous-like drift
  // with NO trig — smooth, never repeating in lockstep. The Y phases double as swell phases (radius
  // breathes as the blob rises), so no extra timers are needed.
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);
  const y3 = useSharedValue(0);
  const x1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  const x3 = useSharedValue(0);
  // Whole-layer breathing — opacity drifts up/down very slowly so the field feels alive.
  const breath = useSharedValue(0);

  useEffect(() => {
    const drift = (sv: SharedValue<number>, period: number) => {
      // Easing MUST be a direct worklet (Easing.sin), NOT Easing.ease: `ease` builds a cubic Bezier
      // internally, and a bezier/factory easing assigned to a shared value FROM THE JS THREAD produces
      // a malformed animation → "animation.onStart is undefined" crash (reanimated v4 gotcha; the orb's
      // withRepeat proves Easing.sin is safe). This was the chat-only crash.
      sv.value = withRepeat(
        withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
        -1,
        true, // reverse → smooth back-and-forth, like rising/sinking light
      );
    };
    // Rise (Y) and sway (X) on co-prime-ish periods so the blobs never sync — the field keeps
    // slowly reshaping.
    drift(y1, durationMs);
    drift(y2, durationMs * 1.45);
    drift(y3, durationMs * 1.9);
    drift(x1, durationMs * 1.3);
    drift(x2, durationMs * 0.85);
    drift(x3, durationMs * 1.6);
    drift(breath, durationMs * 0.8);
  }, [y1, y2, y3, x1, x2, x3, breath, durationMs]);

  // Blobs rise from the lower half and sway sideways. baseX/amp/rise are tuned so the bright core
  // sweeps across like the aurora bands in the refs while staying mostly low (the CardGradient is
  // darkest up top, so glow concentrated low reads best).
  const c1x = useDerivedValue(() => sw.value * (0.28 + 0.22 * (x1.value - 0.5)));
  const c1y = useDerivedValue(() => sh.value * (0.82 - 0.55 * y1.value));
  const c2x = useDerivedValue(() => sw.value * (0.72 + 0.24 * (x2.value - 0.5)));
  const c2y = useDerivedValue(() => sh.value * (0.95 - 0.6 * y2.value));
  const c3x = useDerivedValue(() => sw.value * (0.5 + 0.3 * (x3.value - 0.5)));
  const c3y = useDerivedValue(() => sh.value * (0.7 - 0.5 * y3.value));
  // Deep ambient glow — large, slow, sits low for depth. Reuses phases (correlated is fine: it's huge
  // and faint, it just breathes behind the others).
  const c4x = useDerivedValue(() => sw.value * (0.5 + 0.16 * (x1.value - 0.5)));
  const c4y = useDerivedValue(() => sh.value * (1.02 - 0.35 * y2.value));
  // Bright hotspot — small, drifts across, blooms to cyan-white under "screen" (the luminous core).
  const c5x = useDerivedValue(() => sw.value * (0.4 + 0.4 * x3.value));
  const c5y = useDerivedValue(() => sh.value * (0.78 - 0.5 * y1.value));

  const radius = width * r;
  // Swell — radius breathes ±6% as each blob rises (tied to its Y phase, no extra timers).
  const r1 = useDerivedValue(() => radius * (0.94 + 0.12 * y1.value));
  const r2 = useDerivedValue(() => radius * 0.85 * (0.94 + 0.12 * y2.value));
  const r3 = useDerivedValue(() => radius * 1.05 * (0.94 + 0.12 * y3.value));

  const colorA = isDark ? DARK_A : LIGHT_A;
  const colorB = isDark ? DARK_B : LIGHT_B;
  const colorCore = isDark ? DARK_CORE : LIGHT_CORE;
  // Light rides a touch softer than dark (the limes are bright on the off-white card).
  const baseOpacity = opacity ?? (isDark ? 0.35 : 0.36);
  // Breathing opacity for the aurora group — drifts between 82% and 100% of the base.
  const auroraOpacity = useDerivedValue(() => baseOpacity * (0.82 + 0.18 * breath.value));

  const onLayout = (e: LayoutChangeEvent) => {
    sw.value = e.nativeEvent.layout.width;
    sh.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout} pointerEvents="none">
      <Canvas style={{ flex: 1 }}>
        {/* "screen" → overlaps add up and bloom toward cyan-white (the luminous aurora cores). */}
        <Group blendMode="screen" opacity={auroraOpacity}>
          <Blur blur={blur} />
          <Circle cx={c4x} cy={c4y} r={radius * 1.4} color={colorA} />
          <Circle cx={c1x} cy={c1y} r={r1} color={colorA} />
          <Circle cx={c2x} cy={c2y} r={r2} color={colorB} />
          <Circle cx={c3x} cy={c3y} r={r3} color={colorB} />
          <Circle cx={c5x} cy={c5y} r={radius * 0.4} color={colorCore} />
        </Group>

        {/* Filmic grain — desaturated turbulence at a whisper, soft-light blended. Kills banding on
            the smooth gradients and gives the premium, photographed-aurora texture (refs). */}
        {grain ? (
          <Group blendMode="softLight" opacity={isDark ? 0.07 : 0.05}>
            <Fill>
              <Turbulence freqX={0.85} freqY={0.85} octaves={3} seed={7} />
              <ColorMatrix matrix={GRAIN_DESATURATE} />
            </Fill>
          </Group>
        ) : null}
      </Canvas>
    </View>
  );
}
