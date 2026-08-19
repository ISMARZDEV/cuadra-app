import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Si el sistema pide REDUCIR MOVIMIENTO.
 *
 * No es un extra: para quien sufre mareo con el movimiento, una pantalla entera que sube y se
 * acerca es exactamente lo que esa preferencia existe para evitar. Quien la consulte debe APAGAR su
 * animación, no suavizarla.
 *
 * Se suscribe al cambio además de leer el valor inicial: la preferencia se puede activar con la app
 * abierta, y una lectura única dejaría la animación viva el resto de la sesión.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
