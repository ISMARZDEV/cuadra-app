import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import ArrowLeft from "@/assets/save/arrow-carrusel-left.svg";
import ArrowRight from "@/assets/save/arrow-carrusel-right.svg";
import { t } from "@/i18n";

import { pageAt } from "../gallery";

/** El tamaño nativo del trazo, tal cual lo da el diseño. */
const ARROW_W = 13;
const ARROW_H = 53;

/** Cuánto se separan del canto de la pantalla. */
const EDGE_INSET = 14;

/** Lo que le queda a una flecha cuando ya no lleva a ningún sitio. */
const SPENT = 0.25;

interface Props {
  count: number;
  /**
   * Su propia opacidad, 1 → 0, que se apaga con el PRIMER punto de scroll.
   *
   * Se MULTIPLICA con la de la tarjeta —viven dentro de su contenedor— así que sólo puede adelantar
   * su desaparición, nunca retrasarla. Ver `CONTROLS_FADE`.
   */
  fade: SharedValue<number>;
  /** El desplazamiento horizontal de la galería: de aquí sale en qué extremo estamos. */
  offsetX: SharedValue<number>;
  /** Ancho de una foto, para traducir el desplazamiento a página. */
  pageWidth: number;
  onStep: (delta: number) => void;
}

/**
 * Las flechas de la galería, a los costados de la tarjeta.
 *
 * ⭐ **Van DENTRO del contenedor que se desvanece con el plegado**, así que nunca pueden sobrevivir
 * a la foto. Pero llevan ADEMÁS su propio desvanecido, mucho más corto: la tarjeta aguanta entera
 * casi medio recorrido a propósito y estos son CONTROLES — se apartan con el primer punto de scroll.
 * Ver `CONTROLS_FADE`.
 *
 * ⭐ En el extremo NO desaparecen: se apagan a `SPENT`. Quitarlas movería la composición cada vez
 * que llegas al final, y el usuario perdería la referencia de que hay una flecha ahí.
 */
export function GalleryArrows(props: Props) {
  return (
    <>
      <Arrow side="left" {...props} />
      <Arrow side="right" {...props} />
    </>
  );
}

function Arrow({
  side,
  count,
  offsetX,
  pageWidth,
  fade,
  onStep,
}: Props & { side: "left" | "right" }) {
  const isLeft = side === "left";

  const style = useAnimatedStyle(() => {
    const page = pageAt(offsetX.value, pageWidth, count);
    const usable = isLeft ? page > 0 : page < count - 1;
    return {
      // Dos causas multiplicadas: estar en el extremo (`SPENT`) y el desvanecido del scroll.
      opacity: (usable ? 1 : SPENT) * fade.value,
      // ⭐ Una flecha gastada —o ya desvanecida— deja de RECIBIR el toque, no sólo de verse apagada:
      // un control que parece inerte y aun así responde enseña a desconfiar de lo que se ve.
      pointerEvents: usable && fade.value > 0.5 ? "auto" : "none",
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          justifyContent: "center",
          ...(isLeft ? { left: EDGE_INSET } : { right: EDGE_INSET }),
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(isLeft ? "save.product.gallery.previous" : "save.product.gallery.next")}
        aria-label={t(isLeft ? "save.product.gallery.previous" : "save.product.gallery.next")}
        onPress={() => onStep(isLeft ? -1 : 1)}
        // El trazo mide 13pt de ancho y un objetivo de 13pt no se acierta con el pulgar.
        hitSlop={{ top: 20, bottom: 20, left: 18, right: 18 }}
      >
        <View>
          {isLeft ? (
            <ArrowLeft width={ARROW_W} height={ARROW_H} />
          ) : (
            <ArrowRight width={ARROW_W} height={ARROW_H} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
