import { Blur, Canvas, Circle, Group } from "@shopify/react-native-skia";
import { useEffect } from "react";
import { type LayoutChangeEvent, View, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Liquid palette (Cleo-style aquatic lava lamp), theme-aware:
//   • light → the bright brand limes pop cleanly on the off-white card bg.
//   • dark  → deeper emerald/teal greens that GLOW softly behind the near-black glass; the pure limes
//     read neon and clip to white under the blur, so we go richer + more aquatic (UX call).
const LIGHT_A = "#8EF33A";
const LIGHT_B = "#C3FA7E";
const DARK_A = "#0E7C5A"; // deep teal-emerald
const DARK_B = "#1FAE7C"; // aquatic green
const TWO_PI = Math.PI * 2;

// Subtle animated "lava lamp": a few brand-green blobs drift slowly, heavily blurred by Skia so they
// read as liquid/aquatic. Mounted BEHIND the CardGradient (so the gradient stays intact on top) and
// over the card's glass — soft enough to coexist with both. Skia v2 + reanimated v4: shared/derived
// values are passed straight to Skia props (no useValue/useClock). The whole layer is low-opacity and
// `pointerEvents="none"` upstream so it never interferes with the chat.
export function ChatLavaBackground() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();

  // Canvas size (set on layout) + three independent slow drift phases (ping-pong 0↔1).
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);

  useEffect(() => {
    const drift = (sv: typeof p1, durationMs: number) => {
      sv.value = withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        true, // reverse → smooth back-and-forth, like rising/sinking wax
      );
    };
    drift(p1, 9000);
    drift(p2, 13000);
    drift(p3, 17000);
  }, [p1, p2, p3]);

  // Blobs rise from the bottom and sway sideways — normalized to the measured canvas size.
  const c1x = useDerivedValue(() => sw.value * (0.3 + 0.08 * Math.sin(p1.value * TWO_PI)));
  const c1y = useDerivedValue(() => sh.value * (0.78 - 0.58 * p1.value));
  const c2x = useDerivedValue(() => sw.value * (0.7 - 0.1 * Math.sin(p2.value * TWO_PI)));
  const c2y = useDerivedValue(() => sh.value * (0.92 - 0.62 * p2.value));
  const c3x = useDerivedValue(() => sw.value * (0.5 + 0.12 * Math.sin(p3.value * TWO_PI)));
  const c3y = useDerivedValue(() => sh.value * (0.68 - 0.5 * p3.value));

  const r = width * 0.42; // big soft blobs
  const colorA = isDark ? DARK_A : LIGHT_A;
  const colorB = isDark ? DARK_B : LIGHT_B;

  const onLayout = (e: LayoutChangeEvent) => {
    sw.value = e.nativeEvent.layout.width;
    sh.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {/* Lower opacity than it looks — the heavy blur + the CardGradient on top keep it whisper-soft. */}
      <Canvas style={{ flex: 1, opacity: isDark ? 0.35 : 0.45 }}>
        <Group>
          <Blur blur={55} />
          <Circle cx={c1x} cy={c1y} r={r} color={GREEN_A} />
          <Circle cx={c2x} cy={c2y} r={r * 0.85} color={GREEN_B} />
          <Circle cx={c3x} cy={c3y} r={r * 1.05} color={GREEN_B} />
        </Group>
      </Canvas>
    </View>
  );
}
