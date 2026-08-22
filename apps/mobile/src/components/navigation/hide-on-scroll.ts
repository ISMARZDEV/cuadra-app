// La DECISIÓN de esconder o traer una barra según el scroll, como función pura.
//
// Vive aparte del hook a propósito: las cuatro guardas de abajo costaron un defecto cada una en la
// rejilla del «ver más», y son lo único de este mecanismo que se puede probar sin dispositivo. Un
// worklet no se puede testear; una función sí.

/** Cuánta distancia hay que comprometer en la MISMA dirección antes de conmutar (histéresis). */
export const COMMIT_DISTANCE = 28;
/** Cuántas pantallas de recorrido tiene que haber para que esconder la barra COMPENSE. */
export const MIN_SCROLL_SCREENS = 1;
/** Cerca del tope la barra está siempre visible, se mire hacia donde se mire. */
export const TOP_ZONE = 24;

export interface ScrollFrame {
  y: number;
  maxY: number;
  viewportH: number;
  /** Cuánto se movió desde el frame anterior. Positivo = bajando. */
  dy: number;
  /** Distancia acumulada en la dirección actual. */
  accum: number;
  dragging: boolean;
  hidden: boolean;
  /** Anclada: no se esconde pase lo que pase. En el detalle = cantidad ≥ 1. */
  pinned?: boolean;
}

export interface HideDecision {
  hidden: boolean;
  accum: number;
}

/**
 * Las guardas, en orden. Con menos, la barra «no sabe qué hacer»: se esconde y reaparece sola.
 *
 * ⭐ Lleva la directiva `"worklet"` porque la llama el worklet del scroll, en el HILO DE UI, y un
 * worklet no puede invocar una función JS normal — revienta con «Tried to synchronously call a
 * non-worklet function». La directiva tiene que ser la PRIMERA sentencia del cuerpo.
 *
 * Por eso mismo sólo puede capturar NÚMEROS (las constantes de arriba) y su argumento: un worklet
 * no captura funciones JS, así que este archivo no puede empezar a llamar a nada de fuera.
 *
 * No afecta a los tests: sin el plugin de Babel de Reanimated es una cadena suelta inofensiva.
 */
export function nextHiddenState(f: ScrollFrame): HideDecision {
  "worklet";

  // GUARDA 0 — ANCLADA gana a todo. En el detalle, con cantidad ≥ 1 la barra se queda aunque se
  // desplace la pantalla entera: el usuario ya eligió cuántos, y esconderle la acción a mitad de
  // esa decisión es quitársela de las manos justo cuando iba a usarla.


  if (f.pinned) return { hidden: false, accum: 0 };

  // GUARDA 1 — si el recorrido NO COMPENSA, no se pliega nunca. Con dos o tres filas la barra se
  // escondía sólo para reaparecer al llegar al final un segundo después.
  if (f.maxY <= f.viewportH * MIN_SCROLL_SCREENS) return { hidden: false, accum: 0 };

  // GUARDA 2 — sin dedo encima no se decide nada. La inercia y el asentamiento también emiten
  // eventos, y al final de la lista generan deltas en los dos sentidos. Esconder navegación
  // responde a una INTENCIÓN; el impulso es física.


  if (!f.dragging) return { hidden: f.hidden, accum: f.accum };

  // GUARDA 3 — el REBOTE no es recorrido. Fuera del rango real el estado se congela.
  if (f.y < 0 || f.y > f.maxY) return { hidden: f.hidden, accum: f.accum };

  // GUARDA 4 — HISTÉRESIS. Cambiar de sentido reinicia la cuenta: media pantalla abajo y media
  // arriba no pueden sumar como si fueran el mismo gesto.
  const accum = f.dy > 0 === f.accum > 0 ? f.accum + f.dy : f.dy;

  if (f.y <= TOP_ZONE) return { hidden: false, accum };
  if (accum > COMMIT_DISTANCE) return { hidden: true, accum: 0 };
  if (accum < -COMMIT_DISTANCE) return { hidden: false, accum: 0 };
  return { hidden: f.hidden, accum };
}
