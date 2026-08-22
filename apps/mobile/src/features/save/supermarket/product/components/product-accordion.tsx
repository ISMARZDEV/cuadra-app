import { ChevronDown } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useReducedMotion,
  type WithSpringConfig,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { SECTION } from "../product-type";

/**
 * MEDIDO en la librería de patrones (`apps/claude/self-sizing-sheet`): un asentamiento monótono de
 * ~220 ms que NUNCA pasa de su posición final.
 *
 * ⭐ Sin sobrepaso = amortiguamiento crítico (ζ≈1.0), no el ζ≈0.72 «premium» del resto de la
 * librería. Un contenedor cuyo alto se lee como MAQUETACIÓN no puede rebotar: pasarse haría que
 * cada fila de dentro saltara visiblemente más allá de su sitio.
 *
 * `mass` explícito — Reanimated 4 usa 4 por defecto, no 1.
 */
const RESIZE: WithSpringConfig = { mass: 1, stiffness: 361, damping: 38 };

interface Props {
  title: string;
  children: ReactNode;
  /** Abierto al montar. Los de contenido real (Detalles) sí; los de relleno, no. */
  initiallyOpen?: boolean;
}

/**
 * Una sección plegable cuyo alto SIGUE a su contenido.
 *
 * ⭐ El contenido NO se anima. Se queda en su sitio definitivo dentro de un contenedor con
 * `overflow: hidden`, y lo que lo revela es el borde de arriba del contenedor al crecer. Es el
 * revelado más barato que existe: N filas cuestan CERO animaciones, y da igual que sean 3 o 30.
 */
export function ProductAccordion({ title, children, initiallyOpen = false }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  // El alto del contenido cambia con el LAYOUT, no por fotograma: su sitio es el estado de React.
  const [contentHeight, setContentHeight] = useState(0);
  const reducedMotion = useReducedMotion();

  const height = useSharedValue(initiallyOpen ? 0 : 0);
  const chevron = useSharedValue(initiallyOpen ? 1 : 0);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setContentHeight((prev) => (prev === h ? prev : h));
  }, []);

  const target = open ? contentHeight : 0;
  height.value = reducedMotion ? target : withSpring(target, RESIZE);
  chevron.value = reducedMotion ? (open ? 1 : 0) : withSpring(open ? 1 : 0, RESIZE);

  const bodyStyle = useAnimatedStyle(() => ({ height: height.value }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  return (
    <View className="border-b border-border dark:border-border-dark">
      <Pressable
        accessibilityRole="button"
        aria-label={open ? t("save.product.collapse") : t("save.product.expand")}
        accessibilityLabel={`${title} — ${open ? t("save.product.collapse") : t("save.product.expand")}`}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between"
        style={{ paddingVertical: 18 }}
      >
        <Text
          className="text-text dark:text-text-dark"
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: SECTION }}
        >
          {title}
        </Text>
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronDown} size={24} color="#0B3B2E" />
        </Animated.View>
      </Pressable>

      <Animated.View style={[bodyStyle, { overflow: "hidden" }]}>
        {/* Se mide SIEMPRE, esté abierto o cerrado: si sólo se midiera al abrir, el primer
            despliegue animaría de 0 a 0 y el contenido aparecería de golpe al terminar. */}
        <View onLayout={onContentLayout} style={{ position: "absolute", left: 0, right: 0 }}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}
