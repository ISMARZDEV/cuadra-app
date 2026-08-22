import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureResponderEvent } from "react-native";

import { isRevealTap } from "./reveal-tap";

/**
 * Cuánto reposo hace falta para que una barra se retire sola.
 *
 * Ni tan corto que se vaya mientras el usuario lee —leer no es estar inactivo—, ni tan largo que
 * deje de tener sentido. Cuatro segundos es donde una mirada quieta pasa de «estoy leyendo esto» a
 * «me olvidé de la pantalla».
 */
export const IDLE_HIDE_MS = 4000;

interface Options {
  /** ANCLADA: no se esconde por nada. En el detalle = cantidad ≥ 1. */
  pinned?: boolean;
}

/**
 * Las tres reglas de visibilidad de una barra, en un solo sitio para que las dos se comporten igual:
 *
 * 1. **Scroll hacia abajo** la esconde (eso lo decide `nextHiddenState`, en el hilo de UI).
 * 2. **Reposo** la esconde: sin tocar la pantalla, se va sola.
 * 3. **Un TOQUE** la trae de vuelta — un toque, no un arrastre. Si bastara con mover el dedo,
 *    reaparecería en mitad del mismo scroll que acaba de esconderla.
 *
 * `pinned` gana a las tres.
 */
export function useNavVisibility({ pinned = false }: Options = {}) {
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El temporizador captura `pinned` por clausura con el valor que tenía al armarse, y para cuando
  // salta puede haber cambiado.
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  // Dónde se posó el dedo, para saber al levantarlo si fue toque o arrastre.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Rearma el reposo. Se llama en cada señal de vida — un evento por gesto, nunca por fotograma. */
  const armIdle = useCallback(() => {
    clearTimer();
    if (pinnedRef.current) return;
    timer.current = setTimeout(() => {
      if (!pinnedRef.current) setHidden(true);
    }, IDLE_HIDE_MS);
  }, []);

  /** Lo llama el scroll cuando decide esconder o traer. */
  const setHiddenByScroll = useCallback(
    (value: boolean) => {
      setHidden(value);
      armIdle();
    },
    [armIdle],
  );

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  }, []);

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const tap = isRevealTap({
        dx: e.nativeEvent.pageX - start.x,
        dy: e.nativeEvent.pageY - start.y,
      });
      // ⭐ Sólo un TOQUE revela. Un arrastre no: es el gesto que la esconde, y revelarla a mitad
      // haría que apareciera y desapareciera dentro del mismo movimiento.
      if (tap) setHidden(false);
      armIdle();
    },
    [armIdle],
  );

  // Anclarla la trae al momento y desarma el reposo: si el usuario acaba de poner una unidad, el
  // botón tiene que estar ahí YA, no esperar a la siguiente interacción.
  useEffect(() => {
    if (pinned) {
      clearTimer();
      setHidden(false);
    } else {
      armIdle();
    }
  }, [pinned, armIdle]);

  // Un temporizador vivo tras salir de la pantalla escribiría estado en algo que ya no existe.
  useEffect(() => clearTimer, []);

  return { hidden, setHiddenByScroll, onTouchStart, onTouchEnd };
}
