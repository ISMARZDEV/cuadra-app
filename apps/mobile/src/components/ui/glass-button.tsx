import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useId } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Round liquid-glass symbol button (Figma "Button - Liquid Glass - Symbol"), tinted glass + a
// colorless depth gradient + a springy press.
// `accent` = the primary action (the send button): the photo-negative of the normal tool buttons,
// so it stands out in BOTH themes and the mic⇄send swap reads clearly.
type GlassButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  accent?: boolean;
  /**
   * Dibuja el punto de aviso arriba a la derecha. Es SÓLO la marca visual: quien lo enciende debe
   * además decirlo en `label`, porque un punto de color no existe para un lector de pantalla.
   */
  badge?: boolean;
};

// El punto de aviso. Rojo señal —no el lima de marca— porque no es decoración del botón sino una
// interrupción: tiene que despegarse del vidrio en los dos temas. El aro del color del fondo lo
// separa del glifo cuando cae encima de una zona clara del vidrio.
const BADGE_DOT = 10;
const BADGE_RING = 2;
const BADGE_COLOR = "#FF3B30";

// Colorless depth gradient (shadow/highlight at top → transparent at bottom), same recipe as the
// chat card's CardGradient. Drawn with react-native-svg — NOT expo-linear-gradient, whose native
// view (ExpoLinearGradient) isn't always linked into the dev build and crashes with "Unable to get
// the view config"; react-native-svg is already used across the app so it's guaranteed present.
// Drawn ALREADY circular (rounded rect, rx=size/2) so the parent glass needs no overflow:hidden —
// that clip + a scale transform was making the rounded mask "cut" on press.
function ButtonDepthGradient({ color, size }: { color: string; size: number }) {
  // Unique gradient id per instance — duplicate <Defs> ids across multiple <Svg> can collide.
  const gid = `btnGrad-${useId()}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} rx={size / 2} ry={size / 2} fill={`url(#${gid})`} />
    </Svg>
  );
}

export function GlassButton({
  icon,
  label,
  onPress,
  size = 44,
  iconSize = 22,
  accent = false,
  badge = false,
}: GlassButtonProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const shape = { width: size, height: size, borderRadius: size / 2 } as const;

  // Inverted brand pair per theme — dark → dark-green glass + lime icon; light → lime glass +
  // dark-green icon (the icon never washes out). `accent` (the send button) flips the theme so it's
  // the photo-negative of the tool buttons: distinct in BOTH themes, making the mic⇄send swap obvious.
  const styleDark = accent ? !isDark : isDark;
  const tint = styleDark ? "#001A0C" : "#C2FB7E";
  const iconColor = styleDark ? "#C2FB7E" : "#002E22";
  // Depth gradient color follows the fill: a dark shadow on the dark-green fill, a light lime
  // highlight (#E7FDCD) on the lime fill.
  const gradientColor = styleDark ? "#21362A" : "#E7FDCD";

  // Press feedback: a springy scale-down. The native liquid-glass "light up" is masked by the
  // depth gradient on top, so we drive the tactile feedback ourselves — consistent on iOS & Android.
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.86, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[shape, animStyle]}
    >
      <GlassSurface
        isInteractive
        tint={tint}
        style={{ ...shape, alignItems: "center", justifyContent: "center" }}
      >
        <ButtonDepthGradient color={gradientColor} size={size} />
        <Icon as={icon} size={iconSize} color={iconColor} />
      </GlassSurface>

      {/* Fuera del `GlassSurface`, no dentro: el vidrio nativo TIÑE lo que tiene encima, y un punto
          rojo pasado por el tinte lima deja de leerse como aviso. Va como hermano, por delante.
          Se monta después del vidrio en vez de con `zIndex` porque un `GlassView` nativo no
          respeta el apilado de sus hermanos de forma fiable en Fabric — el orden del árbol sí. */}
      {badge ? (
        <View
          testID="glass-button-badge"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: BADGE_DOT + BADGE_RING * 2,
            height: BADGE_DOT + BADGE_RING * 2,
            borderRadius: (BADGE_DOT + BADGE_RING * 2) / 2,
            backgroundColor: BADGE_COLOR,
            borderWidth: BADGE_RING,
            // El aro toma el color del FONDO de la pantalla, no del botón: es el recorte que
            // despega el punto del vidrio, igual que el contorno de un icono sobre una foto.
            borderColor: isDark ? "#0B0B0B" : "#F4F4F4",
          }}
        />
      ) : null}
    </AnimatedPressable>
  );
}
