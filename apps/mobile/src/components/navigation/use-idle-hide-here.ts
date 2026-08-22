import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { useNavHideStore } from "@/store/nav-hide-store";

/**
 * Pide que, MIENTRAS ESTA PANTALLA esté enfocada, la barra de tabs se retire sola tras un rato sin
 * tocarla (y vuelva con un toque).
 *
 * ⭐ Es opt-in por pantalla a propósito. Aplicado a toda la app, la barra se esfumaba en el chat,
 * en Insights y en Ajustes — donde nadie lo pidió y donde no se gana nada escondiéndola. Sólo tiene
 * sentido donde la pantalla es un catálogo largo y cada franja cuenta.
 *
 * Va con `useFocusEffect` y no con `useEffect`: al empujar otra pantalla encima, ésta NO se
 * desmonta, y con un efecto de montaje el reposo seguiría activo en la pantalla de destino.
 */
export function useIdleHideHere() {
  const setIdleHideEnabled = useNavHideStore((s) => s.setIdleHideEnabled);

  useFocusEffect(
    useCallback(() => {
      setIdleHideEnabled(true);
      // Se apaga SIEMPRE al salir: una pantalla que se va dejándolo encendido se lo deja a la
      // siguiente, que no tiene forma de saber por qué su barra desaparece sola.
      return () => setIdleHideEnabled(false);
    }, [setIdleHideEnabled]),
  );
}
