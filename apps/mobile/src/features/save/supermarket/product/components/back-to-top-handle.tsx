import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import ArrowTop from "@/assets/save/arrow-top-header-up.svg";
import { t } from "@/i18n";

import { indicatorProgress, indicatorTop } from "../motion/gallery-collapse";

interface Props {
  /** El desplazamiento del scroll. */
  scrollY: SharedValue<number>;
  /** Cuánto scroll dura el plegado entero. Se deriva de la pantalla — ver `collapseDistance`. */
  distance: number;
  /** El canto inferior de la elipse con la cabecera DESPLEGADA. */
  expandedTop: number;
  /** Y con la cabecera COMPACTA. Entre los dos interpola: el tirador pertenece a la curva. */
  collapsedTop: number;
  onPress: () => void;
}

/**
 * El tirador de «volver arriba», posado sobre la curva del header.
 *
 * ⭐ Aparece SÓLO cuando ya has bajado, y ahí está su argumento: arriba del todo sería un botón que
 * no hace nada, y un control inerte enseña al usuario a ignorar ese sitio de la pantalla.
 *
 * ⭐ Su opacidad se DERIVA del scroll, no de un estado de React. Un `useState` cruzaría el puente a
 * JS en cada fotograma del gesto para redibujar un icono; interpolando el mismo `scrollY` que ya
 * viaja por el hilo de UI, la aparición es una resta y nadie se entera.
 */
export function BackToTopHandle({ scrollY, distance, expandedTop, collapsedTop, onPress }: Props) {
  const style = useAnimatedStyle(() => {
    // Cuándo aparece lo decide `gallery-collapse`, que es quien conoce el orden del plegado: el
    // tirador no puede asomar mientras la galería siga ahí — sería un atajo para volver arriba
    // ofrecido cuando todavía estás arriba.
    const shown = indicatorProgress(scrollY.value, distance);
    return {
      // ⭐ SIGUE a la curva. Con un `top` fijo calculado sobre la cabecera desplegada, el tirador
      // aparecía a media pantalla y encima del contenido: para entonces el verde ya se había
      // encogido y él se quedaba donde estaba.
      top: indicatorTop(scrollY.value, distance, expandedTop, collapsedTop),
      opacity: shown,
      // Sube los últimos puntos mientras aparece: entrar desplazándose la ata a la curva de la que
      // sale, en vez de encenderse como una luz.
      transform: [{ translateY: (1 - shown) * -6 }],
    };
  });

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 4 },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        aria-label={t("save.product.backToTop")}
        accessibilityLabel={t("save.product.backToTop")}
        onPress={onPress}
        // Área tocable generosa: el dibujo mide 13pt de alto y un objetivo de 13pt no se acierta.
        hitSlop={{ top: 14, bottom: 20, left: 40, right: 40 }}
      >
        <ArrowTop width={53} height={13} />
      </Pressable>
    </Animated.View>
  );
}
