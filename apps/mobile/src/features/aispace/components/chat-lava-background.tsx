import {
  Blur,
  Canvas,
  Circle,
  ColorMatrix,
  Fill,
  Group,
  Turbulence,
} from "@shopify/react-native-skia";
import { View, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";

// Aquatic "aurora" backdrop (Cleo-style), theme-aware — now STATIC (no animation): a few soft brand
// blobs, heavily blurred, blended "screen" so overlaps bloom toward cyan-white. Mounted as an
// absoluteFill behind the chat card. Static (per request): no drift/breathing, so nothing shifts out
// of the card or floats up.
const LIGHT_A = "#8EF33A"; // brand lime
const LIGHT_B = "#C3FA7E"; // pale lime
const LIGHT_CORE = "#E6FFB0"; // pale lime hotspot
const DARK_A = "#001410"; // near-black deep teal — the base the aurora rises out of
const DARK_B = "#0B5A42"; // deep teal — the visible-but-restrained glow
const DARK_CORE = "#1FAE7C"; // emerald hotspot

// Luminance desaturate — turns the RGBA turbulence into gray film grain (alpha kept).
const GRAIN_DESATURATE = [
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0, 0, 0, 1, 0,
];

type Knobs = {
  /** Layer intensity. Default: 0.45 light / 0.35 dark. */
  opacity?: number;
  /** Skia blur radius — the higher, the more liquid/diffuse. Default 60. */
  blur?: number;
  /** Blob radius as a fraction of screen width. Default 0.62. */
  r?: number;
  /** Filmic grain overlay. Default true. */
  grain?: boolean;
};

export function ChatLavaBackground({ opacity, blur = 60, r = 0.62, grain = true }: Knobs = {}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width, height } = useWindowDimensions();

  const colorA = isDark ? DARK_A : LIGHT_A;
  const colorB = isDark ? DARK_B : LIGHT_B;
  const colorCore = isDark ? DARK_CORE : LIGHT_CORE;
  const layerOpacity = opacity ?? (isDark ? 0.35 : 0.45);
  const radius = width * r;

  // Fixed positions (fractions of the screen) — no animation.
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
      <Canvas style={{ flex: 1, opacity: layerOpacity }}>
        {/* "screen" → overlaps add up and bloom toward cyan-white (the luminous aurora cores). */}
        <Group blendMode="screen">
          <Blur blur={blur} />
          <Circle cx={width * 0.5} cy={height * 0.92} r={radius * 1.4} color={colorA} />
          <Circle cx={width * 0.28} cy={height * 0.6} r={radius} color={colorA} />
          <Circle cx={width * 0.74} cy={height * 0.72} r={radius * 0.85} color={colorB} />
          <Circle cx={width * 0.52} cy={height * 0.48} r={radius * 1.05} color={colorB} />
          <Circle cx={width * 0.56} cy={height * 0.62} r={radius * 0.4} color={colorCore} />
        </Group>

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
