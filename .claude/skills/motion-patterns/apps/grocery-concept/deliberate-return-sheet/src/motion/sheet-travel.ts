/**
 * Cuánto baja la hoja cuando está CERRADA.
 *
 * ⭐ Existe por el fotograma de montaje. `onLayout` corre después del primer pintado, así que
 * durante ese primer fotograma el alto medido es 0 — y con 0 de recorrido, una hoja «cerrada» está
 * dibujada en su posición ABIERTA, encima de toda la pantalla. Se ve un parpadeo de la hoja entera
 * al entrar en la pantalla, antes de que nadie la haya abierto.
 *
 * El viewport es siempre ≥ que la hoja, así que sirve de escondite seguro hasta que haya medida
 * real. Es la misma idea que `cuadra-motion` §2: que el estado de REPOSO no dependa de un valor que
 * todavía no ha llegado.
 */
export function closedOffset(measuredHeight: number, viewportHeight: number): number {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return viewportHeight;
  return measuredHeight;
}
