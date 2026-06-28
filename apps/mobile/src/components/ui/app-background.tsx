import { useColorScheme } from "nativewind";
import { StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { theme } from "@/theme";

// Full-bleed vertical gradient (top → bottom). Theme-aware: near-black→teal on dark, white→soft-green
// on light. Drawn with react-native-svg (already in the native build — no rebuild).
//
// IMPORTANT: NativeTabs paints an OPAQUE native background over the root, so this must be rendered
// INSIDE each tab screen (not only at the root) to be visible. `colorScheme` may be passed in
// (ThemeProvider) or it reads its own when used inside a screen.
export function AppBackground({ colorScheme: schemeProp }: { colorScheme?: "light" | "dark" }) {
  const { colorScheme } = useColorScheme();
  const scheme = schemeProp ?? (colorScheme === "dark" ? "dark" : "light");
  const { width, height } = useWindowDimensions();
  const [from, to] = theme[scheme].bgGradient;

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id="appBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#appBg)" />
    </Svg>
  );
}
