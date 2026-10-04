import { useState } from "react";

/**
 * EL RELEVO ORBE → «PENSANDO…», SIN HUECO DE UN FOTOGRAMA.
 *
 * ⚠️⚠️ **Esto NO puede vivir en un `useEffect`, y ahí estuvo el defecto.** Al soltar, `pressing`
 * cae y React COMMITEA ese render antes de correr ningún efecto. En ese commit `lensReady` ya es
 * falso y «pensando» todavía no es verdadero, así que el velo se queda sin ninguna señal que lo
 * sostenga: `use-liquid-focus` ve `listening: true → false`, lanza la ONDA DE SALIDA y programa el
 * progreso a cero. Un fotograma después el efecto enciende «pensando», todo se retargetea de vuelta
 * y la cúpula se ve IRSE Y VOLVER.
 *
 * No faltaba la señal — `thinking` ya estaba dentro de `listening`. **Llegaba tarde.** Y un estado
 * que llega tarde no se arregla añadiendo otra señal: se arregla quitándole el retraso.
 *
 * ⭐ Por eso se ajusta DURANTE EL RENDER. React descarta esta pasada y vuelve a renderizar el
 * componente ANTES de commitear, así que el commit con el hueco no llega a existir nunca. Es el
 * patrón oficial de React para derivar estado de una prop que cambia, y `cuadra-motion` §3 dice
 * exactamente cuándo aplicarlo: sólo cuando el efecto llega tarde. Éste es ese caso.
 *
 * ⚠️ El «anterior» se guarda en **estado, no en un `useRef`**: un ajuste en el render puede
 * descartarse, y un ref ya habría escrito — el ciclo siguiente se lo comería en silencio.
 */
export function useThinkingGate(pressing: boolean): [boolean, (value: boolean) => void] {
  const [thinking, setThinking] = useState(false);
  const [previous, setPrevious] = useState(pressing);

  if (previous !== pressing) {
    setPrevious(pressing);
    // Soltar ENCIENDE, pulsar APAGA. Simétrico a propósito: un gesto nuevo cancela el ciclo
    // anterior, que es la señal más reciente que existe.
    setThinking(!pressing);
  }

  return [thinking, setThinking];
}
