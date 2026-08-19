import type { ReactNode } from "react";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

// UN ESCALÓN de la cascada del buscador: entra un poco después que el de arriba.
//
// ⚠️ UN SOLO RELOJ PARA TODA LA LISTA, y esto es lo que distingue esta implementación de la
// ingenua. La versión anterior daba a cada fila su propio muelle con `withDelay`: doce animaciones
// independientes corriendo a la vez, y la última no terminaba hasta pasado medio segundo. Se
// notaba, y el usuario lo reportó como lentitud.
//
// Aquí el padre mueve UN shared value de 0 a 1 y cada escalón LEE una ventana distinta de ese
// mismo valor. Doce estilos derivados de un reloj no son doce relojes: es una resta en el hilo de
// UI por fotograma. El escalonado sale de la geometría del interpolado, no de temporizadores.
//
// ⭐ Y ESO REGALA LA SALIDA EN ORDEN INVERSO, sin una línea más. Las ventanas están escalonadas
// hacia arriba (la fila 0 vive en [0, 0.34]; la fila 5, en [0.425, 0.765]), así que al llevar el
// reloj de 1 a 0 se cruzan de arriba abajo: **la última fila es la primera en irse** y el título,
// el último. La escalera se deshace por donde se hizo porque el orden está en la GEOMETRÍA, no en
// una lista de retardos que habría que escribir dos veces —y mantener sincronizada.

/** Cuánto se desplaza la ventana de cada escalón dentro del progreso total (0-1). */
const STEP = 0.085;
/** Cuánto dura la entrada de UN escalón, en fracción del progreso total. */
const SPAN = 0.34;
/** Cuánto sube. Sutil a propósito: esto acompaña, no protagoniza. */
const RISE = 14;

interface CascadeItemProps {
  children: ReactNode;
  /** El reloj compartido de la cascada, 0 → 1. */
  progress: SharedValue<number>;
  /** Puesto en la fila. 0 es el título, 1 la primera búsqueda, y así. */
  index: number;
}

export function CascadeItem({ children, progress, index }: CascadeItemProps) {
  const style = useAnimatedStyle(() => {
    // La ventana de ESTE escalón. `CLAMP` es lo que impide que se pase de 1 al final o baje de 0
    // al principio — sin él, los últimos escalones seguirían moviéndose después de asentarse.
    const t = interpolate(
      progress.value,
      [index * STEP, index * STEP + SPAN],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * RISE },
        // Una pizca de escala. 0.98, no 0.9: a más, se lee como un zoom y compite con el
        // desplazamiento. A este tamaño sólo aporta la sensación de que la fila «se asienta».
        { scale: 0.98 + t * 0.02 },
      ],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}
