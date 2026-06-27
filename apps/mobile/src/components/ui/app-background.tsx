import { useColorScheme } from "nativewind";
import { StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { theme } from "@/theme";

// Full-bleed vertical gradient behind the whole app (top → bottom). Theme-aware: deep teal→black on
// dark, white→soft-green on light. Drawn with react-native-svg (already in the native build — no
// expo-linear-gradient / rebuild). Rendered once at the root; screens/navigator stay transparent.
export function AppBackground() {
  const { colorScheme } = useColorScheme();
  const { width, height } = useWindowDimensions();
  const [from, to] = theme[colorScheme === "dark" ? "dark" : "light"].bgGradient;

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
