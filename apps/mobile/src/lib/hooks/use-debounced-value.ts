import { useEffect, useState } from "react";

/**
 * El valor, pero sólo después de que se quedó QUIETO `delayMs`.
 *
 * Escrito a mano a propósito: no hay ningún debounce en este repo y lodash no es dependencia — no
 * se agrega una librería por quince líneas.
 *
 * La diferencia con un simple retardo está en el `clearTimeout` del cleanup: cada cambio CANCELA
 * el anterior, así que escribir rápido produce UN valor, no uno por tecla. Eso es exactamente lo
 * que evita una llamada de red por pulsación.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, initial?: T): T {
  // Por defecto arranca con el valor actual: al montar no hay nada de qué protegerse y esperar
  // sería un retardo gratis. `initial` existe para quien SÍ necesita esa protección — montar con
  // texto ya escrito no es evidencia de que el usuario se haya detenido, y un consumidor que
  // cobra por llamada (el nivel LLM de las sugerencias) no puede permitirse asumirlo.
  const [settled, setSettled] = useState(initial !== undefined ? initial : value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return settled;
}
