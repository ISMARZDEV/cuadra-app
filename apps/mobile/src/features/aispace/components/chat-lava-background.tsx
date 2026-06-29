import { Blur, Canvas, Circle, Group } from "@shopify/react-native-skia";
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
const LIGHT_A = "#8EF33A";
const LIGHT_B = "#C3FA7E";
const DARK_A = "#0E7C5A"; // deep teal-emerald
const DARK_B = "#1FAE7C"; // aquatic green

type Knobs = {
  /** Layer intensity. Lower = whisper-soft. Default: 0.45 light / 0.35 dark. */
  opacity?: number;
  /** Skia blur radius — the higher, the more liquid/diffuse. Default 60. */
  blur?: number;
  /** Base drift period (ms); the three blobs scale off it (×1, ×1.45, ×1.9). Default 9000. */
  durationMs?: number;
  /** Blob radius as a fraction of screen width. Default 0.62. */
  r?: number;
};

// Subtle animated aurora: a few brand-green blobs drift slowly, heavily blurred by Skia so they read
// as liquid. Mounted as an absoluteFill BEHIND the chat card (so the card's glass refracts it and it
// bleeds softly around the card's margins). Skia v2 + reanimated v4: shared/derived values go straight
// to Skia props (no useValue/useClock). The whole layer is low-opacity and pointerEvents="none" so it
// never interferes with the chat.
export function ChatLavaBackground({ opacity, blur = 60, durationMs = 9000, r = 0.62 }: Knobs = {}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();

  // Canvas size (set on layout). Blobs are normalized to it so the layout drives everything.
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);

  // Each blob gets an independent rise phase (Y) and sway phase (X), both ping-ponging 0↔1 at
  // DIFFERENT periods. Combining two reversing timings linearly gives organic Lissajous-like drift
  // with NO trig — smooth, never repeating in lockstep.
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);
  const y3 = useSharedValue(0);
  const x1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  const x3 = useSharedValue(0);

  useEffect(() => {
    const drift = (sv: SharedValue<number>, period: number) => {
      sv.value = withRepeat(
        withTiming(1, { duration: period, easing: Easing.inOut(Easing.ease) }),
        -1,
        true, // reverse → smooth back-and-forth, like rising/sinking light
      );
    };
    // Rise phases (vertical) and sway phases (horizontal) run on co-prime-ish periods so the blobs
    // never sync up — the field keeps slowly reshaping.
    drift(y1, durationMs);
    drift(y2, durationMs * 1.45);
    drift(y3, durationMs * 1.9);
    drift(x1, durationMs * 1.3);
    drift(x2, durationMs * 0.85);
    drift(x3, durationMs * 1.6);
  }, [y1, y2, y3, x1, x2, x3, durationMs]);

  // Blobs rise from the lower half and sway sideways. baseX/amp/rise are tuned so the bright core
  // sweeps across like the aurora bands in the refs while staying mostly low (the CardGradient is
  // darkest up top, so glow concentrated low reads best).
  const c1x = useDerivedValue(() => sw.value * (0.28 + 0.22 * (x1.value - 0.5)));
  const c1y = useDerivedValue(() => sh.value * (0.82 - 0.55 * y1.value));
  const c2x = useDerivedValue(() => sw.value * (0.72 + 0.24 * (x2.value - 0.5)));
  const c2y = useDerivedValue(() => sh.value * (0.95 - 0.6 * y2.value));
  const c3x = useDerivedValue(() => sw.value * (0.5 + 0.3 * (x3.value - 0.5)));
  const c3y = useDerivedValue(() => sh.value * (0.7 - 0.5 * y3.value));

  const radius = width * r;
  const colorA = isDark ? DARK_A : LIGHT_A;
  const colorB = isDark ? DARK_B : LIGHT_B;
  const layerOpacity = opacity ?? (isDark ? 0.35 : 0.45);

  const onLayout = (e: LayoutChangeEvent) => {
    sw.value = e.nativeEvent.layout.width;
    sh.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout} pointerEvents="none">
      <Canvas style={{ flex: 1, opacity: layerOpacity }}>
        {/* "screen" → overlaps add up and bloom toward cyan-white (the luminous aurora cores). */}
        <Group blendMode="screen">
          <Blur blur={blur} />
          <Circle cx={c1x} cy={c1y} r={radius} color={colorA} />
          <Circle cx={c2x} cy={c2y} r={radius * 0.85} color={colorB} />
          <Circle cx={c3x} cy={c3y} r={radius * 1.05} color={colorB} />
        </Group>
      </Canvas>
    </View>
  );
}
