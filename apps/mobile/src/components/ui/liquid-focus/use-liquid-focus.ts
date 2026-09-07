import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat,
  withSpring, withTiming,
} from "react-native-reanimated";
import { LENS_TIMING } from "./model";

/**
 * LA ENTRADA Y LA SALIDA DE LA CÚPULA — y NO son la misma curva invertida, a propósito.
 *
 * ⭐ **Sube con MUELLE.** Una masa de agua que asciende lleva inercia: llega arriba, se pasa un poco
 * y se asienta. Con ζ ≈ 0.73 (`damping 16` sobre `stiffness 120`) el sobrepaso es de ~3.5 % y se
 * estabiliza en ~0.5 s — se percibe como peso, no como un rebote de juguete.
 *
 * ⭐⭐ **Baja con CURVA, sin sobrepaso.** Un líquido que se retira NO rebota: lo vacía la gravedad.
 * Un muelle a la vuelta haría que la cúpula se hundiera de más y volviera a asomar, que es
 * exactamente la sensación de «goma» que delata una animación mal pensada. `Easing.out(cubic)`
 * arranca rápido y frena al llegar.
 *
 * ⭐ **Y la salida dura MÁS que la entrada** (420 ms contra ~500 ms de asentamiento): devolver el
 * contexto es un acto de lectura —el usuario tiene que reencontrar lo que estaba mirando—, mientras
 * que entrar es una respuesta a su dedo. El patrón ya lo decía de sus 250/350.
 */
export const LENS_MOTION = {
  rise: { mass: 1, stiffness: 120, damping: 16 },
  fallMs: 420,
  /** El reloj LINEAL de la coreografía. Un pelo más largo que el asentamiento del muelle: las capas
   *  terminan de llegar justo cuando la cúpula deja de moverse. */
  phaseInMs: 520,
  phaseOutMs: 420,
} as const;

/** Medio ciclo del vaivén de la cúpula. Lento a propósito: es una respiración, no un parpadeo. */
export const PULSE_HALF_MS = 1250;

export function useLiquidFocus(listening: boolean, dimmed: boolean) {
  const startupReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(startupReducedMotion);
  const progress = useSharedValue(listening ? 1 : 0);
  const dim = useSharedValue(dimmed ? 1 : 0);
  // ⭐ EL VAIVÉN de la cúpula: −1..1, en reposo 0. La cúpula NO sube y se queda quieta — SUBE Y
  // BAJA, y al moverse deforma distinto en cada fotograma. Es lo que la hace leerse como agua en
  // vez de como una máscara puesta encima, y está en el nombre del shot de referencia
  // («liquid-blur-PULSE-interaction»).
  const swing = useSharedValue(0);
  // EL RELOJ DE LA COREOGRAFÍA. Lineal a propósito — ver `lensUniforms`.
  const phase = useSharedValue(listening ? 1 : 0);

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
      progress.value = Number(listening);
    } else if (listening) {
      // SUBE con muelle: el sobrepaso es lo que le da masa. Ver `LENS_MOTION`.
      progress.value = withSpring(1, LENS_MOTION.rise);
    } else {
      // BAJA con curva: sin rebote, y frenando al llegar.
      progress.value = withTiming(0, {
        duration: LENS_MOTION.fallMs,
        easing: Easing.out(Easing.cubic),
      });
    }
    // El reloj de la coreografía va SIEMPRE lineal, suba o baje: la curva de cada capa la pone su
    // propia ventana. Ponerle easing aquí aplastaría la escalera.
    phase.value = reducedMotion
      ? Number(listening)
      : withTiming(Number(listening), {
          duration: listening ? LENS_MOTION.phaseInMs : LENS_MOTION.phaseOutMs,
          easing: Easing.linear,
        });
    return () => {
      cancelAnimation(progress);
      cancelAnimation(phase);
    };
  }, [listening, progress, phase, reducedMotion]);

  useEffect(() => {
    dim.value = withTiming(Number(dimmed), {
      duration: reducedMotion ? 0 : LENS_TIMING.dimMs,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(dim);
  }, [dimmed, dim, reducedMotion]);

  useEffect(() => {
    if (!listening || reducedMotion) {
      cancelAnimation(swing);
      // Vuelve al CENTRO en vez de congelarse donde estuviera: si se quedara arriba, la siguiente
      // pulsación arrancaría con la cúpula ya desplazada.
      swing.value = withTiming(0, { duration: LENS_TIMING.withdrawMs });
      return;
    }
    // Arranca abajo y `withRepeat(..., true)` lo hace ir y venir entre −1 y 1.
    swing.value = -1;
    swing.value = withRepeat(
      // `inOut(sin)` y no lineal: una rampa recta da un vaivén de metrónomo, con un cambio de
      // sentido brusco en cada extremo. La sinusoide FRENA al llegar y arranca despacio, que es
      // como se mueve una masa de agua.
      withTiming(1, { duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(swing);
  }, [listening, reducedMotion, swing]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion || progress.value <= 0 ? 0 : 1,
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.18 }));
  return { progress, swing, phase, lensStyle, dimStyle, reducedMotion };
}
