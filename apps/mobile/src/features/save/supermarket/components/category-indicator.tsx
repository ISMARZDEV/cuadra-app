import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

// El indicador de la ruleta: al girar, el conjunto se inclina hacia donde vas, la raya larga cede
// sitio y la corta de ese lado se adelanta. Al posarse en la siguiente categoría, todo vuelve.
//
// ⚠️ LAS RAYAS SE MUEVEN POCO Y NUNCA SE ESTIRAN, y eso viene de un intento fallido: se probó a
// deformarlas fuerte —encoger la larga y engordar la corta, como una gota pasando de una a otra— y
// quedó mal. La razón es de fondo: **escalar un trazo escala TAMBIÉN su grosor y sus extremos
// redondos**, así que al estirarlas se volvían manchas. Un encogimiento suave de la larga sí
// aguanta; agrandar cualquiera de ellas, no.
//
// Los trazados son los de `assets/carrusel-save/currusel-indicator-page.svg`, copiados literalmente
// —no se importa el archivo porque hace falta animar cada raya por su cuenta y subirle el grosor—.
// Si el archivo cambia, hay que traer los `d` de nuevo.
const D_CENTER =
  "M49.5463 4.88135C44.5569 5.59821 38.9819 6.00048 33.0932 6.00048C27.2045 6.00048 21.6265 5.59821 16.6401 4.88135";
const D_LEFT = "M2.00049 2.00049C4.10082 2.58175 6.41626 3.0925 8.90199 3.5219";
const D_RIGHT = "M57.0005 3.5219C59.4892 3.0925 61.8017 2.58085 63.902 2.00049";
const ACTIVE = "#6AC400";
const IDLE = "#ABE369";

/** Grosor del trazo. Más que los 4 del archivo: en pantalla las rayas se leían finas. */
const STROKE = 5.5;
/** Aire alrededor del dibujo dentro del lienzo. Sin él, el trazo grueso se recorta contra el borde
 *  del `viewBox` —SVG recorta por ahí— y las rayas salen con los cantos rebanados. Cubre lo que se
 *  mueven al animarse más medio trazo. */
const PAD = 10;

const ART_W = 66;
const ART_H = 8;
export const INDICATOR_WIDTH = ART_W + PAD * 2;
export const INDICATOR_HEIGHT = ART_H + PAD * 2;
/** A qué altura del lienzo cae la línea de las rayas. Lo necesita quien lo coloca: el lienzo lleva
 *  aire de sobra y medir contra su borde dejaría el indicador descolgado. */
export const INDICATOR_BASELINE = PAD + 4;

/** Cuánto se inclina el conjunto entero hacia el sentido del giro, a medio camino entre dos. */
const LEAN = 9;
/** Cuánto CEDE la raya larga mientras pasa el testigo. Encogerla aguanta bien; agrandarla no. */
const SQUEEZE = 0.42;
/** Cuánto se adelanta la raya corta que va a recibir el relevo. */
const SIDE_SHIFT = 4;

/**
 * Cuánto se APARTAN las rayas cortas de la larga.
 *
 * El archivo las deja a 7.7 de distancia, pero esa separación se dibujó para un trazo de 4. Al
 * subirlo a 5.5, los extremos REDONDOS crecen 0.75 por lado y se comen el hueco: quedaban ~2 de
 * aire y las tres rayas se leían pegadas.
 *
 * Apartarlas obliga a moverlas TAMBIÉN en vertical. Las rayas están puestas sobre la curva del
 * arco, así que una que se va hacia fuera y se queda a la misma altura se sale de la curva y el
 * conjunto deja de leerse como una línea. `SLOPE` es la pendiente del propio dibujo en ese tramo,
 * sacada de los extremos de la raya izquierda, así que separarlas las mantiene sobre el arco.
 */
const GAP = 4.5;
const SLOPE = (3.5219 - 2.00049) / (8.90199 - 2.00049);
/** Hacia fuera es hacia ARRIBA en los dos lados: el arco sube por los costados. */
const GAP_RISE = -GAP * SLOPE;

function Dash({ d, color, dx = 0 }: { d: string; color: string; dx?: number }) {
  return (
    <Svg
      width={INDICATOR_WIDTH}
      height={INDICATOR_HEIGHT}
      viewBox={`${-PAD} ${-PAD} ${INDICATOR_WIDTH} ${INDICATOR_HEIGHT}`}
      fill="none"
    >
      {/* La separación se DESPLAZA, no se escala: mover una raya entera respeta su grosor y sus
          extremos redondos. Va acá dentro y no en el contenedor animado para que se sume a la
          animación en vez de pisarla. */}
      <Path
        d={d}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        transform={dx === 0 ? undefined : `translate(${dx} ${GAP_RISE})`}
      />
    </Svg>
  );
}

interface CategoryIndicatorProps {
  /** El giro en RANURAS. Su parte fraccionaria es lo único que anima las rayas. */
  rotation: SharedValue<number>;
  /** Hasta dónde puede girar: en los topes, la raya del lado muerto se apaga. */
  limit: number;
}

export function CategoryIndicator({ rotation, limit }: CategoryIndicatorProps) {
  // Todo sale de la parte fraccionaria del giro. La animación no tiene estado propio ni
  // temporizadores: es una función PURA de dónde está la rueda, así que sigue igual de bien al dedo
  // que a la inercia, y no puede desincronizarse de lo que se ve.

  // El conjunto entero se inclina. Al moverse las tres rayas a la vez, la curva que forman —cada una
  // está a su altura para acompañar el arco— se conserva intacta.
  const leanStyle = useAnimatedStyle(() => {
    const frac = rotation.value - Math.round(rotation.value);
    return { transform: [{ translateX: frac * 2 * LEAN }] };
  });

  // La raya larga cede sitio. Su centro coincide con el del lienzo, así que basta el `scaleX`: no
  // hace falta corregir el eje.
  const centerStyle = useAnimatedStyle(() => {
    const frac = rotation.value - Math.round(rotation.value);
    return { transform: [{ scaleX: 1 - SQUEEZE * Math.abs(frac) * 2 }] };
  });

  // Las cortas: la del lado hacia el que giras se adelanta; la de atrás se apaga.
  //
  // Se escriben las DOS a mano en vez de generarlas con una función auxiliar: `useAnimatedStyle` es
  // un hook y los hooks no pueden salir de una llamada.
  const leftStyle = useAnimatedStyle(() => {
    const frac = rotation.value - Math.round(rotation.value);
    const towards = frac < 0;
    const t = Math.abs(frac) * 2;
    return {
      // En el tope no se enciende nunca: sería prometer un giro que no existe.
      opacity: rotation.value <= 0.01 ? 0 : towards ? 1 : 1 - 0.55 * t,
      transform: [{ translateX: -SIDE_SHIFT * (towards ? t : -t) }],
    };
  });

  const rightStyle = useAnimatedStyle(() => {
    const frac = rotation.value - Math.round(rotation.value);
    const towards = frac > 0;
    const t = Math.abs(frac) * 2;
    return {
      opacity: rotation.value >= limit - 0.01 ? 0 : towards ? 1 : 1 - 0.55 * t,
      transform: [{ translateX: SIDE_SHIFT * (towards ? t : -t) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ width: INDICATOR_WIDTH, height: INDICATOR_HEIGHT }, leanStyle]}
    >
      {/* Cada raya en su propio lienzo, SUPERPUESTOS y del mismo tamaño: así conserva sus
          coordenadas del diseño —incluida su altura sobre la curva— y a la vez se mueve sin
          arrastrar a las otras. La larga va la ÚLTIMA para quedar por delante. */}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, leftStyle]}>
        <Dash d={D_LEFT} color={IDLE} dx={-GAP} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, rightStyle]}>
        <Dash d={D_RIGHT} color={IDLE} dx={GAP} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, centerStyle]}>
        <Dash d={D_CENTER} color={ACTIVE} />
      </Animated.View>
    </Animated.View>
  );
}
