import { useColorScheme } from "nativewind";
import { type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Shared outer chrome for the 3 carousel cards (Accounts/Spaces/Daily Diary) — white + lime
// border in light, a translucent dark-green gradient + the same lime border in dark (exact
// tokens from Figma's Accounts-card node, light 178:11258 / dark 178:12374). Extracted here
// instead of duplicated 3x per cuadra-mobile's "if a visual block repeats, it's a component" rule.
export function InsightsCardShell({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        borderRadius: 45,
        borderCurve: "continuous",
        borderWidth: 1.5,
        borderColor: "#C2FB7E",
        overflow: "hidden",
        backgroundColor: isDark ? "#0A1A16" : "#FFFFFF",
      }}
    >
      {isDark && (
        <Svg style={{ position: "absolute", width: "100%", height: "100%" }}>
          <Defs>
            <LinearGradient id="cardShellGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#002018" stopOpacity="0.2" />
              <Stop offset="1" stopColor="#034842" stopOpacity="0.2" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#cardShellGradient)" />
        </Svg>
      )}
      <View style={{ padding: 14 }}>{children}</View>
    </View>
  );
}
