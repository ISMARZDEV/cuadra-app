import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useId } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

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
   * El COLOR del vidrio.
   *
   * `brand` (por defecto) es el par lima/verde de siempre. `danger` es el rojo de CERRAR o
   * DESCARTAR — el mismo papel que el aviso rojo del contador, y por eso comparte su familia: en
   * esta app el rojo significa «esto interrumpe o deshace», nunca decora.
   *
   * Es una PROP y no un botón nuevo a propósito: el vidrio, el gradiente de profundidad y el muelle
   * del toque son los mismos, y duplicarlos daría dos botones que se separarían con el tiempo.
   */
  tone?: "brand" | "danger";
  /**
   * Aviso arriba a la derecha: `true` = punto a secas · un NÚMERO = contador. `false`, `0` o
   * ausente no dibujan nada — un cero en un contador es ruido, la ausencia ya dice «no llevas nada».
   *
   * Es SÓLO la marca visual: quien lo enciende debe además decirlo en `label`, porque ni un punto
   * ni un número de color existen para un lector de pantalla.
   */
  badge?: boolean | number;
};

// El aviso. Rojo señal —no el lima de marca— porque no es decoración del botón sino una
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
  tone = "brand",
  badge = false,
}: GlassButtonProps) {
  // `true` = punto · número > 0 = contador · lo demás = nada.
  const badgeCount = typeof badge === "number" ? badge : null;
  const showBadge = badgeCount != null ? badgeCount > 0 : badge;
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const shape = { width: size, height: size, borderRadius: size / 2 } as const;

  // Inverted brand pair per theme — dark → dark-green glass + lime icon; light → lime glass +
  // dark-green icon (the icon never washes out). `accent` (the send button) flips the theme so it's
  // the photo-negative of the tool buttons: distinct in BOTH themes, making the mic⇄send swap obvious.
  const styleDark = accent ? !isDark : isDark;
  // El rojo sigue EXACTAMENTE la misma receta que el lima —vidrio oscuro + glifo claro en tema
  // oscuro, vidrio claro + glifo oscuro en claro—, sólo que en la familia del rojo señal del aviso.
  // Copiar la receta y no sólo el color es lo que hace que los dos botones se lean como el mismo
  // objeto en dos estados, en vez de como dos componentes distintos.
  const danger = tone === "danger";
  //
  // ⚠️ EL ROJO CLARO VA SATURADO (`#FF9A90`, no un rosa pálido) y se midió por qué: el vidrio
  // nativo sólo luce cuando tiene algo DEBAJO que refractar, y este botón se apoya en el gris liso
  // de la hoja. Con un tinte suave el disco desaparecía y quedaba la «x» flotando. El lima puede
  // permitírselo porque vive sobre el verde oscuro del header, que sí le da contraste.
  const tint = styleDark ? (danger ? "#2A0705" : "#001A0C") : danger ? "#FF9A90" : "#C2FB7E";
  const iconColor = styleDark ? (danger ? "#FF8177" : "#C2FB7E") : danger ? "#5C0F0A" : "#002E22";
  // Depth gradient color follows the fill: a dark shadow on the dark fill, a light highlight on
  // the light fill.
  const gradientColor = styleDark ? (danger ? "#4A1512" : "#21362A") : danger ? "#FFC9C3" : "#E7FDCD";

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
      {showBadge ? (
        <View
          testID="glass-button-badge"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            // Con número, la píldora CRECE a lo ancho pero conserva su alto: un contador de dos
            // cifras dentro de un círculo fijo saldría apretado o recortado.
            minWidth: BADGE_DOT + BADGE_RING * 2,
            height: BADGE_DOT + BADGE_RING * 2,
            paddingHorizontal: badgeCount != null ? 4 : 0,
            borderRadius: (BADGE_DOT + BADGE_RING * 2) / 2,
            backgroundColor: BADGE_COLOR,
            borderWidth: BADGE_RING,
            alignItems: "center",
            justifyContent: "center",
            // El aro toma el color del FONDO de la pantalla, no del botón: es el recorte que
            // despega el aviso del vidrio, igual que el contorno de un icono sobre una foto.
            borderColor: isDark ? "#0B0B0B" : "#F4F4F4",
          }}
        >
          {badgeCount != null ? (
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 10, color: "#FFFFFF" }}>
              {badgeCount}
            </Text>
          ) : null}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
