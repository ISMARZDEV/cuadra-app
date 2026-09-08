import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { LENS_TIMING } from "./model";

/**
 * La referencia no ofrece un pico de sobrepaso defendible. La salida conserva el intervalo
 * observado; la entrada se alargó por dirección visual para que la masa nazca y se abra con una
 * aceleración simétrica. Un pequeño desfase deja que el control responda antes que el fondo.
 */
export const LENS_MOTION = {
  enterMs: LENS_TIMING.enterMs,
  fallMs: LENS_TIMING.withdrawMs,
  leadMs: LENS_TIMING.leadMs,
  controlMs: LENS_TIMING.controlMs,
  releaseMs: LENS_TIMING.releaseMs,
} as const;

const EASE_OUT = Easing.bezier(0.2, 0, 0, 1);
// La curva medida del patrón: respuesta temprana y una cola larga de asentamiento. La sinusoide
// anterior acumulaba aceleración hasta mitad del recorrido y hacía que una masa de 520 ms pareciera
// empujada de golpe; ésta sale con continuidad y desacelera durante la mayor parte de la subida.
const ENTER_EASE = Easing.bezier(0.2, 0, 0, 1);
const BREATH_CYCLE_MS = 4800;
/**
 * EL SELLADO DEL TELÓN — cerrar el velo de borde a borde para tapar la navegación por debajo.
 *
 * Cerrar es más lento que abrir a propósito: el sellado tiene que pasar DESAPERCIBIDO —es un truco
 * de escenografía, no un efecto— y un cierre rápido se lee como un fundido a blanco.
 */
const SEAL_IN_MS = 520;
const SEAL_OUT_MS = 320;

export function useLiquidFocus(listening: boolean, dimmed: boolean, sealed = false) {
  const startupReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(startupReducedMotion);
  const progress = useSharedValue(listening ? 1 : 0);
  const dim = useSharedValue(dimmed ? 1 : 0);
  const breath = useSharedValue(0);
  const release = useSharedValue(0);
  const seal = useSharedValue(0);
  const wasListening = useRef(listening);

  useEffect(() => {
    let acceptQuery = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      acceptQuery = false;
      setReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (acceptQuery) setReducedMotion(enabled);
    }).catch(() => {});
    return () => {
      acceptQuery = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(release);
      release.value = 0;
      progress.value = Number(listening);
    } else if (listening) {
      // Una reactivación mientras la onda todavía sale la repliega desde su punto actual; resetearla
      // a cero produciría un corte visible en vez de retargetear la transición.
      release.value = withTiming(0, {
        duration: LENS_MOTION.controlMs,
        easing: EASE_OUT,
      });
      progress.value = withDelay(
        LENS_MOTION.leadMs,
        withTiming(1, { duration: LENS_MOTION.enterMs, easing: ENTER_EASE }),
      );
    } else {
      // La salida no baja toda la cúpula a la vez: la onda radial es quien la va borrando desde el
      // orbe hacia arriba. El progreso se conserva hasta que el frente cruza el viewport y sólo se
      // apaga en una cola breve, ya invisible, para dejar el estado de reposo exacto.
      progress.value = withDelay(
        Math.max(0, LENS_MOTION.releaseMs - 40),
        withTiming(0, { duration: 40, easing: EASE_OUT }),
      );
    }
    return () => {
      cancelAnimation(progress);
      cancelAnimation(release);
    };
  }, [listening, progress, reducedMotion, release]);

  useEffect(() => {
    if (!listening || reducedMotion) {
      // Al soltar se congela la forma actual mientras se retira; volver de golpe a fase cero haría
      // saltar el menisco justo cuando el dedo deja el control.
      cancelAnimation(breath);
      return;
    }
    breath.value = 0;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(breath);
  }, [breath, listening, reducedMotion]);

  useEffect(() => {
    const previous = wasListening.current;
    wasListening.current = listening;

    if (reducedMotion) {
      cancelAnimation(release);
      release.value = 0;
      return;
    }
    if (listening) return;
    if (!previous) return;

    release.value = 0;
    release.value = withTiming(1, {
      duration: LENS_MOTION.releaseMs,
      // El ease-out anterior consumía casi la mitad del recorrido apenas se soltaba: la onda
      // saltaba fuera del orbe y después sólo parecía desvanecerse. Esta curva mantiene un viaje
      // legible desde abajo hasta arriba y frena sin cortar el último anillo.
      easing: ENTER_EASE,
    });
    return () => cancelAnimation(release);
  }, [listening, reducedMotion, release]);

  useEffect(() => {
    dim.value = withTiming(Number(dimmed), {
      duration: reducedMotion ? 0 : LENS_TIMING.dimMs,
      easing: EASE_OUT,
    });
    return () => cancelAnimation(dim);
  }, [dimmed, dim, reducedMotion]);

  useEffect(() => {
    seal.value = withTiming(sealed ? 1 : 0, {
      duration: sealed ? SEAL_IN_MS : SEAL_OUT_MS,
      easing: Easing.inOut(Easing.cubic),
    });
    return () => cancelAnimation(seal);
  }, [sealed, seal]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion
      || (progress.value <= 0 && (release.value <= 0 || release.value >= 1))
      ? 0
      : 1,
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.16 }));

  return { progress, dim, breath, release, seal, lensStyle, dimStyle, reducedMotion };
}
