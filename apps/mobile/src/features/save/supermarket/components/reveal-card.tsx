import type { ReactNode } from "react";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

// La tarjeta que EMERGE al desplazarse: sube, se enfoca y toma cuerpo según se acerca al centro
// del viewport.
//
// ⚠️ NO usa las animaciones `entering` de Reanimated, y no es preferencia. Tres razones medidas:
//   1. `FlatList` DESMONTA las filas lejanas y las remonta al volver — con `entering`, cada
//      producto se re-animaría cada vez que reaparece. Un parpadeo perpetuo, no un efecto.
//   2. Con `numColumns > 1` los retardos por ítem funcionan en iOS y disparan todo a la vez en
//      Android (bug conocido de la librería).
//   3. `streaming-text.tsx` ya dejó anotado que `entering` no dispara de forma fiable en la New
//      Architecture de este proyecto.
//
// En su lugar el estado es una FUNCIÓN PURA de la posición: reciclar una fila no reinicia nada,
// porque no hay nada que reiniciar — se recalcula. Y sólo se animan `opacity` y `transform`, las
// dos propiedades que no obligan a recalcular layout.

/**
 * En cuántas FILAS se reparte la aparición. Derivado del alto de fila, no un número de píxeles: con
 * una distancia fija menor que una fila, sólo la que entra está animando y la anterior ya terminó —
 * se leía como tarjetas apareciendo de una en una, a saltos.
 *
 * El número ES cuántas filas están en vuelo a la vez: a 3.5 se mueven la última, la penúltima y la
 * antepenúltima, cada una en un punto distinto de su recorrido. Eso es lo que produce una OLA
 * continua en vez de una sucesión de destellos — y cuantas más filas la componen, más despacio
 * avanza cada una y más suave se percibe el conjunto.
 */
const REVEAL_ROWS = 3.5;
/** Cuánto sube al aparecer. Suficiente para leerse como movimiento, no tanto como para que la
 *  rejilla parezca elástica. */
const RISE = 22;
/** De qué tamaño arranca. El acercamiento es lo que hace de «niebla»: lo lejano se lee más chico y
 *  más apagado, y al entrar toma cuerpo. Un blur de verdad por tarjeta sería inviable en RN —
 *  obliga a rasterizar cada una en cada frame.
 *
 *  Más cerca de 1 que antes: con 0.92 el salto de tamaño competía con el movimiento y se notaba
 *  «la animación» en vez del contenido. */
const START_SCALE = 0.96;
/** Hasta qué punto del recorrido la tarjeta ya está OPACA del todo. Termina de aparecer bastante
 *  antes de terminar de colocarse: así el producto se puede leer mientras todavía se asienta, en
 *  vez de pasar media entrada en penumbra. */
const OPACITY_AT = 0.45;

interface RevealCardProps {
  /** Índice en la rejilla. Con él y el alto de fila se sabe dónde EMPIEZA esta tarjeta, sin medir
   *  cada una: todas las tarjetas miden lo mismo (sus bloques tienen alto fijo). */
  index: number;
  columns: number;
  /** Alto de una fila incluido su hueco. `0` mientras no se ha medido la primera. */
  rowHeight: SharedValue<number>;
  /** Desplazamiento actual de la lista. */
  scrollY: SharedValue<number>;
  /** Alto visible de la lista, del propio evento de scroll. */
  viewportH: SharedValue<number>;
  /** Dónde empieza el contenido bajo el chrome. */
  contentTop: number;
  /** `false` = sin efecto. Lo apaga «Reducir movimiento» del sistema. */
  enabled: boolean;
  width: number;
  paddingTop: number;
  /** Se llama con el alto real de la tarjeta. Sólo la primera lo necesita. */
  onMeasure?: (height: number) => void;
  children: ReactNode;
}

export function RevealCard({
  index,
  columns,
  rowHeight,
  scrollY,
  viewportH,
  contentTop,
  enabled,
  width,
  paddingTop,
  onMeasure,
  children,
}: RevealCardProps) {
  const row = Math.floor(index / columns);

  const style = useAnimatedStyle(() => {
    // Sin medida todavía, o con el efecto apagado: la tarjeta se dibuja normal. El estado por
    // defecto es VISIBLE a propósito — un fallo de medición debe dejar productos a la vista, nunca
    // una rejilla en blanco.
    //
    // ⚠️ Se comprueban las DOS medidas, y la de `viewportH` costó un bug real: el `onLayout` del
    // ÍTEM dispara ANTES que el de la lista, así que hubo una ventana con `rowHeight` ya medido y
    // `viewportH` todavía en 0. Ahí toda tarjeta daba progreso 0 y la pantalla entraba EN BLANCO,
    // sin nada que la despertara hasta el primer scroll. Cualquier medida que falte = dibujar
    // normal.
    if (!enabled || rowHeight.value <= 0 || viewportH.value <= 0) return {};

    const rowTop = contentTop + row * rowHeight.value;
    // Distancia entre el borde INFERIOR del viewport y el techo de la fila. Positiva = la fila ya
    // entró; cuanto más grande, más adentro está.
    const entered = scrollY.value + viewportH.value - rowTop;
    const p = interpolate(
      entered,
      [0, rowHeight.value * REVEAL_ROWS],
      [0, 1],
      Extrapolation.CLAMP,
    );

    // Desaceleración cúbica sobre el progreso. Interpolar en lineal hace que la tarjeta llegue a su
    // sitio a la misma velocidad a la que salió, y eso se lee mecánico: lo natural es entrar rápido
    // y ASENTAR despacio. Es la misma familia de curva que usa el resto de la app al detenerse.
    const eased = 1 - (1 - p) * (1 - p) * (1 - p);

    return {
      opacity: interpolate(p, [0, OPACITY_AT], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: (1 - eased) * RISE },
        { scale: START_SCALE + eased * (1 - START_SCALE) },
      ],
    };
  });

  return (
    <Animated.View
      style={[{ width, paddingTop }, style]}
      onLayout={
        onMeasure ? (e) => onMeasure(e.nativeEvent.layout.height) : undefined
      }
    >
      {children}
    </Animated.View>
  );
}
