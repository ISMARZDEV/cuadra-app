import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useColorScheme } from "nativewind";
import { Platform, View, type ViewProps } from "react-native";

// Cross-platform "glass" surface, resolved per platform (cuadra-design-system):
//   • iOS 26+  → real Apple liquid glass (expo-glass-effect GlassView)
//   • Android / older iOS → frosted blur (expo-blur) — the closest equivalent; Android has
//     no native liquid glass, so this is an approximation, not the same effect.
//   • web → translucent fill.
type GlassSurfaceProps = ViewProps & { intensity?: number };

export function GlassSurface({ intensity = 40, style, children, ...rest }: GlassSurfaceProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" style={style} {...rest}>
        {children}
      </GlassView>
    );
  }

  if (Platform.OS !== "web") {
    return (
      <BlurView
        intensity={intensity}
        tint={isDark ? "dark" : "light"}
        experimentalBlurMethod="dimezisBlurView"
        style={style}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[style, { backgroundColor: isDark ? "rgba(18,32,26,0.72)" : "rgba(255,255,255,0.72)" }]}
      {...rest}
    >
      {children}
    </View>
  );
}
