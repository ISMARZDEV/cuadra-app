import { BlurView } from "expo-blur";
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { Platform, View, type ViewProps } from "react-native";
import SquircleView from "react-native-fast-squircle";

// Cross-platform "glass" surface with Apple corner smoothing (squircle) + liquid glass border:
//   • iOS 26+  → real Apple liquid glass (expo-glass-effect GlassView) — handles its own border
//   • Android / older iOS → frosted blur (expo-blur) + SquircleView + gradient border
//
// ⚠️ Esta rama de respaldo NO se ejecuta en iOS 26, que es donde se prueba la app: un defecto suyo
// puede pasar meses sin verse (ya pasó — ver el historial de `react-native-squircle-view`). Cambiar
// algo aquí sin poder ejecutarlo es escribir a ciegas.
//   • web → translucent fill.
//
// Border: vertical gradient simulating light reflection on glass edge —
//   top half is bright (light catch), bottom half fades to transparent.
type GlassSurfaceProps = ViewProps & {
  intensity?: number;
  colorScheme?: "auto" | "light" | "dark";
  borderWidth?: number;
  isInteractive?: boolean;
  // Optional color tint for the glass (e.g. brand green on the chat tool buttons). Applied as the
  // native GlassView tintColor on iOS 26, and as a translucent overlay on the blur/web fallback so
  // the same tint reads consistently in Expo Go and on unsupported OS.
  tint?: string;
  tintOpacity?: number;
  // Override the edge-reflection gradient [top, bottom]. Use to make the contour MORE visible on a
  // specific surface (e.g. the chat card + dock) without changing every glass surface app-wide.
  borderColors?: [string, string];
  // Variante del cristal nativo (iOS 26). `regular` = esmerilado, el defecto de toda la app.
  // `clear` = mucho más transparente y refractivo: es el liquid glass que deja ver el contenido de
  // detrás. Solo tiene sentido donde HAY contenido detrás — la doc de Expo lo dice explícitamente:
  // "Content must exist behind the GlassView for the effect to render".
  glassEffectStyle?: "regular" | "clear";
};

export function GlassSurface({
  intensity = 40,
  colorScheme: colorSchemeProp = "auto",
  borderWidth = 2.5,
  isInteractive = false,
  tint,
  tintOpacity = 0.7,
  borderColors: borderColorsProp,
  glassEffectStyle = "regular",
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const { colorScheme: systemColorScheme } = useColorScheme();
  const isDark = systemColorScheme === "dark";

  // iOS 26+: native liquid glass with safety check + color scheme override.
  // GlassView handles its own border natively.
  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glassEffectStyle}
        colorScheme={colorSchemeProp}
        isInteractive={isInteractive}
        tintColor={tint}
        style={style}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  // Android / older iOS: blur + squircle + liquid glass gradient border.
  if (Platform.OS !== "web") {
    // Glass edge: bright at top (light reflection), fading to transparent at bottom. Caller can
    // override (borderColors prop) to make the contour stronger on a specific surface.
    const borderColors: [string, string] =
      borderColorsProp ??
      (isDark
        ? ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"]
        : ["rgba(255,255,255,0.9)", "rgba(255,255,255,0.15)"]);

    return (
      <View style={[style, { overflow: "hidden" }]}>
        <LinearGradient
          colors={borderColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, padding: borderWidth }}
        >
          <SquircleView cornerSmoothing={0.8} style={{ flex: 1 }}>
            <BlurView
              intensity={intensity}
              tint={isDark ? "dark" : "light"}
              experimentalBlurMethod="dimezisBlurView"
              style={{ flex: 1 }}
            >
              {tint ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: tint,
                    opacity: tintOpacity,
                  }}
                />
              ) : null}
              {children}
            </BlurView>
          </SquircleView>
        </LinearGradient>
      </View>
    );
  }

  // Web fallback.
  return (
    <View
      style={[
        style,
        {
          backgroundColor: tint ?? (isDark ? "rgba(18,32,26,0.72)" : "rgba(255,255,255,0.72)"),
          borderWidth: 1.5,
          borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
        },
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

// Cross-platform glass container — fuses multiple glass surfaces visually when they're close.
// iOS 26+: native GlassContainer (merges adjacent GlassView elements).
// Fallback: plain View (no fusion, but layout is preserved).
type GlassContainerProps = ViewProps & { spacing?: number };

export function GlassSurfaceContainer({ spacing, style, children, ...rest }: GlassContainerProps) {
  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassContainer spacing={spacing} style={style} {...rest}>
        {children}
      </GlassContainer>
    );
  }

  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}
