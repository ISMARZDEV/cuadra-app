// EL BARRIDO DE PRESENTACIÓN de la ruleta, como PLAN: adónde va y cuándo, sin tocar nada.
//
// Separado del hook a propósito. El hook sólo sabe de temporizadores y de `scrollTo`; la decisión
// de QUÉ recorrido enseñar es una regla del producto y se puede razonar —y probar— sin montar una
// pantalla ni fingir el reloj.

/**
 * Cuánto se espera antes del primer paso.
 *
 * DESPUÉS DEL REBOTE, no encima. La última categoría asienta su muelle hacia los ~1050ms (ver
 * `POP_*` en `category-arc`), y esto deja además un respiro para que la pantalla se lea antes de
 * que nada se mueva sola. Arrancando antes, la rueda desplazaba círculos que todavía se estaban
 * montando: dos animaciones a la vez y ninguna se entiende.
 */
const FIRST_DELAY = 1800;
/**
 * Lo que tarda la rueda en deslizarse de un puesto al siguiente.
 *
 * ⚠️ NO ES CONFIGURABLE: es lo que tarda `scrollTo({ animated: true })`, y lo decide iOS. Está
 * escrito aquí como ESTIMACIÓN para poder razonar la cadencia, no como un ajuste.
 *
 * Se intentó gobernarlo animando el desplazamiento a mano (`withTiming` + el worklet `scrollTo`
 * empujando la lista fotograma a fotograma) y SALIÓ CARO: esta lista tiene `snapToInterval`, y el
 * motor de imantado de iOS pelea contra un desplazamiento programático continuo. La rueda dejaba de
 * aceptar el dedo durante los ~13 segundos que duraba el barrido — el usuario lo describió como no
 * poder «salir de ese bucle». El camino nativo es tosco pero NO SECUESTRA el gesto, y eso vale más
 * que ajustar la curva.
 */
export const WHEEL_SLIDE_MS = 350;
/**
 * ⭐ CUÁNTO SE QUEDA QUIETA EN CADA CATEGORÍA. **Éste es el número del ritmo.**
 *
 * ⚠️ Y AQUÍ ESTUVO MI ERROR DE CRITERIO, que merece quedar escrito. Al pedirse «bájale la
 * velocidad» razoné que lo suave era alargar el MOVIMIENTO, y dejé la rueda moviéndose el 80% del
 * tiempo. Eso no es suave: es una CORRIDA. Sin descanso entre puestos las categorías desfilan de un
 * tirón y no se distingue ninguna.
 *
 * Un carrusel de presentación no es un desplazamiento continuo — es una SECUENCIA DE LLEGADAS. Lo
 * que hace legible cada categoría no es lo despacio que viaje, sino el rato que se queda quieta al
 * llegar. Por eso la pausa es MÁS LARGA que el deslizamiento, y por eso es este número el que hay
 * que tocar si el ritmo no convence.
 */
export const WHEEL_PAUSE_MS = 1150;
/** Entre un puesto y el siguiente: lo que dura el viaje más lo que descansa al llegar. */
const STEP_MS = WHEEL_SLIDE_MS + WHEEL_PAUSE_MS;

import { VISIBLE_SLOTS } from "../arc-geometry";

export interface AutoplayStep {
  /** Milisegundos desde que la rueda se monta. */
  at: number;
  /** A qué ranura girar. */
  to: number;
}

/**
 * El recorrido que la rueda hace sola al entrar: DE LA PRIMERA A LA PENÚLTIMA, DE UNA EN UNA.
 *
 * ⚠️ ESTE ARCHIVO YA SE EQUIVOCÓ DOS VECES, y las dos merecen quedar escritas porque son errores
 * distintos con la misma apariencia de «casi bien»:
 *
 *  1. TRES PASOS FIJOS desde el medio de la lista. Tres es un número que no sabe nada del catálogo:
 *     con 17 categorías la rueda abría en la ranura 7 y el tope estaba en la 13, así que el barrido
 *     moría en la 10. Y lo peor no era pararse corto, sino que ALCANZAR EL FINAL DEPENDÍA DE
 *     CUÁNTAS CATEGORÍAS HUBIERA: con 10 llegaba justo, con 12 se quedaba a una. El mismo código
 *     contaba una historia distinta según los datos de ese día.
 *
 *  2. UN ÚNICO SALTO hasta el tope. Llegaba al final —cumplía la letra— pero de un latigazo: el
 *     recorrido no se veía, y un recorrido que no se ve no enseña que la rueda se desliza, que es
 *     LO ÚNICO que esto existe para decir.
 *
 * La lección común: el destino no era el problema, era el CAMINO. Esto no es una animación que
 * tenga que llegar a un sitio; es una FRASE que hay que poder leer mientras se dice.
 */
export function wheelAutoplayPlan({
  from,
  limit,
}: {
  /** Ranura en la que abre la rueda — hoy, la primera (ver `initialRotation`). */
  from: number;
  /** La última ranura a la que puede girar. */
  limit: number;
}): AutoplayStep[] {
  // Nada que girar: caben todas. Moverla sería mentir sobre que hay más.
  if (limit <= from) return [];

  /**
   * Hasta dónde barre: UN PANTALLAZO — tantos puestos como categorías caben a la vez.
   *
   * ⚠️ ESTO ERA «HASTA LA PENÚLTIMA» Y SE ACORTÓ, con motivo. Recorrer el catálogo entero cumplía la
   * letra —enseñaba dónde termina la rueda— y costaba **de 12 a 18 segundos** según cuántas
   * categorías hubiera ese día. Es demasiado tiempo con algo moviéndose solo en pantalla, aunque se
   * apague al primer toque: durante todo ese rato el usuario está esperando a que termine para
   * poder mirar en paz.
   *
   * Con `VISIBLE_SLOTS` puestos se ven IRSE todas las que estaba mirando y llegar un juego nuevo.
   * Eso ya dice «esto se desliza», que es lo ÚNICO que este barrido existe para decir; «dónde acaba
   * la rueda» es otro objetivo, y perseguirlo aquí salía carísimo.
   *
   * ⭐ Y el número sale de la GEOMETRÍA, no del gusto: es cuántas caben a la vez. Un 4 escrito a
   * mano se despegaría el día que el arco tenga cinco ranuras — y este archivo ya se equivocó dos
   * veces por números que no sabían nada de los datos.
   */
  const reach = from + VISIBLE_SLOTS;
  /**
   * El techo: la PENÚLTIMA. Parar justo en el tope se lee como chocar contra la pared; una ranura
   * antes deja a la vista que todavía queda algo.
   *
   * El `max` cubre el caso degenerado: si sólo hay UN puesto de recorrido, la penúltima ranura es la
   * de partida y la regla literal no movería nada — el usuario no vería girar la rueda.
   */
  const ceiling = Math.max(from + 1, limit - 1);
  const last = Math.min(reach, ceiling);

  const steps: AutoplayStep[] = [];
  for (let to = from + 1; to <= last; to += 1) {
    steps.push({ at: FIRST_DELAY + (to - from - 1) * STEP_MS, to });
  }
  return steps;
}
