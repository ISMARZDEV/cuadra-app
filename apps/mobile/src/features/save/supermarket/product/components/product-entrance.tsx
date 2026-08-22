import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import {
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { settleDelayMs } from "../motion/arrival";
import { ENTRANCE_TIMING } from "../motion/entrance";

interface Props {
  /** Recibe el reloj para repartirlo entre los bloques con `CascadeItem`. */
  children: (cascade: SharedValue<number>) => ReactNode;
  /**
   * `Date.now()` de cuando montó LA PANTALLA (no este componente). De ahí sale cuánto falta para
   * que termine de deslizarse — ver `settleDelayMs`.
   */
  screenMountedAt: number;
}

/**
 * El DUEÑO del reloj de la cascada de entrada del detalle.
 *
 * ⭐ Existe porque la cascada dejó de caber en un componente. Los seis primeros bloques los pone la
 * cabecera y los dos últimos —«Otras tiendas» y el histórico— los pone la pantalla, y **un reloj
 * por sitio no es una cascada**: son dos animaciones que empiezan a la vez y se leen como una sola
 * mal hecha. Un solo `progress` y una VENTANA por bloque (ver `cascade-item`).
 *
 * ⭐⭐ Y por eso la `key` va AQUÍ. Saltar de un producto a otro no desmonta la pantalla
 * (`router.replace` sobre la misma ruta), así que sin remontar este dueño el reloj se quedaría en 1
 * del producto anterior y el nuevo aparecería puesto. Remontar es lo que deja el reposo en la
 * maquetación: `useSharedValue(0)` nace en 0 y el updater de la primera pasada de `useAnimatedStyle`
 * ya lo lee así. Reiniciarlo a mano NO vale — escribir un shared value desde JS ENCOLA, y queda un
 * fotograma con el contenido nuevo a opacidad plena. Ver `entranceKeyOf`.
 */
export function ProductEntrance({ children, screenMountedAt }: Props) {
  const cascade = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  // ⭐ EL RELOJ NO ARRANCA AL MONTAR, sino cuando la pantalla ha terminado de LLEGAR.
  //
  // Arrancando al montar, la cascada sólo se veía la PRIMERA vez que abrías un producto: entonces
  // los datos vienen fríos y el contenido monta a mitad del deslizamiento. Con los datos en caché
  // —siempre a partir de la segunda vez— monta a la vez que la pantalla y los 394 ms se gastan
  // MIENTRAS ésta se desliza; al posarse ya estaba todo puesto. Ver `arrival.ts`, que explica
  // además por qué esto NO cuelga de los eventos de navegación.
  useEffect(() => {
    const arranca = () => {
      // Con «Reducir movimiento» el contenido aparece PUESTO, no escalonado. Lo que se retira es
      // el viaje, nunca la información: la preferencia existe para evitar el movimiento, no para
      // dejar media pantalla en blanco.
      cascade.value = reducedMotion ? 1 : withTiming(1, ENTRANCE_TIMING);
    };

    const falta = settleDelayMs(Date.now() - screenMountedAt);
    if (falta === 0) {
      arranca();
      return;
    }
    const id = setTimeout(arranca, falta);
    return () => clearTimeout(id);
  }, [cascade, reducedMotion, screenMountedAt]);

  return <>{children(cascade)}</>;
}

/**
 * Cuántas veces se ha LLEGADO a esta pantalla. Se combina con la identidad del producto para formar
 * la `key` del dueño del reloj (ver `entranceKeyOf`).
 *
 * ⭐ Existe porque la entrada pertenece a la LLEGADA, no al producto. Volver por segunda vez al
 * mismo producto daba la misma key, y sin cambio de key no hay remonte: el reloj se quedaba en 1 de
 * la vez anterior y la pantalla aparecía puesta. Colgar de la VISITA lo cubre venga por donde venga
 * —volver atrás, cambiar de pestaña, un enlace profundo—, sin que la pantalla tenga que saber cuál
 * de esos caminos se usó.
 *
 * ⚠️ **El primer foco se salta a propósito.** El primer foco ES el montaje, y ahí la cascada ya
 * arranca sola. Contarlo remontaría al dueño del reloj un fotograma después de nacer y la entrada
 * se vería reiniciarse a sí misma — el defecto sería más raro que el que vino a arreglar.
 *
 * El `ref` se muta dentro del efecto, nunca en el render: un render descartado que ya hubiera
 * escrito se comería la primera entrada, y además `react-doctor` lo caza.
 */
export function useEntranceVisit(): number {
  const [visit, setVisit] = useState(0);
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setVisit((v) => v + 1);
    }, []),
  );

  return visit;
}
