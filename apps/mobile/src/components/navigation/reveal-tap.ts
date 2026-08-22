// ¿Ese contacto con la pantalla fue un TOQUE o el principio de un gesto?
//
// La diferencia decide si una barra escondida vuelve. Tocar la trae; arrastrar no —si bastara con
// mover el dedo, la barra reaparecería en mitad del mismo scroll que acaba de esconderla, y el
// rebote del final de una lista la haría parpadear.

/** Cuánto puede moverse el dedo y seguir contando como toque, en puntos. */
export const TAP_SLOP = 10;

export interface TapDelta {
  dx: number;
  dy: number;
}

/**
 * ⭐ La holgura es un CÍRCULO, no una caja. Medida por ejes, un arrastre en diagonal de 8 y 8
 * pasaría como toque cuando el dedo recorrió 11,3 puntos reales.
 */
export function isRevealTap({ dx, dy }: TapDelta): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP;
}
