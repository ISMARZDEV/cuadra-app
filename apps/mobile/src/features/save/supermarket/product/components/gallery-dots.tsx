import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { LIME_INK } from "../product-palette";
import { pageAt } from "../gallery";

/** Diámetro de un punto y el aire entre ellos. Del diseño: pequeños y muy juntos. */
const DOT = 9;
const DOT_GAP = 8;

/** El aire entre el canto inferior de la tarjeta y los puntos. */
const DOTS_GAP = 14;

/**
 * Lo que la banda de puntos OCUPA en el flujo.
 *
 * ⭐⭐ Que ocupe sitio es la diferencia con la versión anterior, y no es un detalle de maquetación:
 * dentro de la foto los puntos flotaban sobre la imagen y no le costaban nada a nadie; en el hueco
 * entre la tarjeta y el título, si no se reserva su alto, el título se come ese espacio y sube por
 * encima de donde debe quedarse. De aquí lo lee `collapseDistance` — ver `CollapseGeometry.dotsBand`.
 */
export const DOTS_BAND = DOTS_GAP + DOT;

/** El gris de los puntos inactivos — el mismo del trazo de las flechas, que son la misma familia. */
const DOT_IDLE = "#D9D8D8";

interface Props {
  count: number;
  /**
   * Su propia opacidad, 1 → 0, que se apaga con el PRIMER punto de scroll.
   *
   * No basta con heredar la de la tarjeta: la foto aguanta entera casi medio recorrido a propósito,
   * y estos son controles — tienen que apartarse en cuanto el dedo empieza. Ver `CONTROLS_FADE`.
   */
  fade: SharedValue<number>;
  /** El desplazamiento horizontal de la galería. El punto activo se DERIVA de aquí. */
  offsetX: SharedValue<number>;
  /** Ancho de una foto, para traducir el desplazamiento a página. */
  pageWidth: number;
}

/**
 * El indicador de página de la galería, en el hueco entre la tarjeta y el nombre del producto.
 *
 * ⭐ **El punto activo se DERIVA del desplazamiento**, no vive en un `useState`. Con dos fuentes, un
 * deslizamiento interrumpido a mitad las desincroniza y el punto acaba señalando una foto que no
 * está. Y de paso se actualiza en el hilo de UI, sin cruzar el puente en cada fotograma.
 */
export function GalleryDots({ count, offsetX, pageWidth, fade }: Props) {
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View
      pointerEvents="none"
      // CENTRADOS en el ancho de la tarjeta (eje principal), y pegados ABAJO de la banda (eje
      // cruzado): el aire de `DOTS_GAP` queda ENCIMA, separándolos de la foto. Debajo ya separa el
      // `pt-5` de la ficha.
      style={[
        {
          height: DOTS_BAND,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: DOT_GAP,
        },
        fadeStyle,
      ]}
    >
      {Array.from({ length: count }, (_, index) => (
        <Dot key={index} index={index} offsetX={offsetX} pageWidth={pageWidth} count={count} />
      ))}
    </Animated.View>
  );
}

/**
 * Un punto.
 *
 * Cada uno lleva su propio estilo animado en vez de mover una pastilla sobre ellos: son dos o tres,
 * y una pastilla que viaja obliga a medir posiciones que el `gap` ya decidió.
 */
function Dot({
  index,
  offsetX,
  pageWidth,
  count,
}: {
  index: number;
  offsetX: SharedValue<number>;
  pageWidth: number;
  count: number;
}) {
  const style = useAnimatedStyle(() => {
    const active = pageAt(offsetX.value, pageWidth, count) === index;
    // `LIME_INK` (#93D555), no el lima suave: sobre el gris del fondo el lima claro se lavaba y el
    // punto activo apenas se distinguía de los apagados — que es justo lo único que tiene que hacer.
    return { backgroundColor: active ? LIME_INK : DOT_IDLE };
  });

  return <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2 }, style]} />;
}
