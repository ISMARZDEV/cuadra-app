import type { ReactNode } from "react";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { useReduceMotion } from "./use-reduce-motion";

// El contenido de Save ENTRA SUBIENDO cuando termina de cargar, en vez de aparecer de golpe donde
// estaba el esqueleto.
//
// Es lo que cose las dos mitades de la espera: el esqueleto dice «esto viene», y el contenido que
// sube dice «ya está». Un cambio seco entre los dos se lee como un parpadeo —y peor, como si la
// pantalla se hubiera roto y vuelto a montar.
//
// SUBE Y SE FUNDE, sin escalar. La escala funciona en una tarjeta suelta, pero aplicada a media
// pantalla se lee como un zoom y marea; acá lo que se quiere decir es «llegó», no «acércate».

/** Cuánto sube. El mismo recorrido que la aparición de las tarjetas de la rejilla
 *  (`reveal-card`), para que Save tenga UN vocabulario de movimiento y no dos. */
const RISE = 22;
/**
 * El MUELLE de la entrada, en vez de una curva de duración fija.
 *
 * Un resorte frena por física —desacelera como frenaría un objeto—, y eso es lo que se lee como
 * «natural»; una curva fija llega siempre en el mismo instante y se nota mecánica. Está afinado
 * DURO y CORTO a propósito: `damping` alto para que no rebote (un rebote en cada tarjeta de un
 * carrusel entero es ruido, no carácter) y `stiffness` alto para que se pose en ~300ms, que es el
 * suelo de lo que se percibe como instantáneo.
 */
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;
interface RiseInProps {
  children: ReactNode;
  /**
   * Escalón de retardo, en «puestos». Cuando entran varios bloques a la vez —los dos rails de la
   * home, por ejemplo— salir todos en el mismo instante se lee como una sola losa que aparece;
   * escalonados unas décimas, se lee como que la pantalla se va montando.
   */
  index?: number;
}

/**
 * Cuánto se retrasa cada escalón.
 *
 * La práctica establecida está entre 55 y 200ms; acá se usa el extremo CORTO porque los escalones
 * se encadenan —título, bajada y cuatro tarjetas por rail, con el segundo rail solapado— y a 100ms
 * la última tarjeta llegaría medio segundo tarde. Con 45 la escalera se lee entera y sigue
 * sintiéndose inmediata.
 */
const STAGGER_MS = 45;

export function RiseIn({ children, index = 0 }: RiseInProps) {
  const reduceMotion = useReduceMotion();
  // Arranca ABAJO y transparente, y sube al montarse. El montaje ES la señal: este componente se
  // monta cuando el contenido está listo, así que no necesita saber nada del estado de carga.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // «Reducir movimiento» no es «animar más despacio»: es NO animar. Se planta en su sitio.
      progress.value = 1;
      return;
    }
    progress.value = withDelay(index * STAGGER_MS, withSpring(1, SPRING));
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    // La opacidad se ACOTA: un muelle puede pasarse de 1 al asentarse, y una opacidad por encima de
    // 1 no hace nada pero deja el fundido plano en el tramo final. Acotada, sube hasta el tope y ahí
    // se queda mientras el movimiento termina de posarse.
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
