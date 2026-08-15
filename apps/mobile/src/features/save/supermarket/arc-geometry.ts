// La geometría del header curvo de Supermarket y de las categorías que van montadas en su borde.
//
// TODO lo de acá está MEDIDO sobre la referencia del diseño, no estimado: se muestreó el borde
// inferior del verde píxel a píxel y de esos puntos salió el modelo. Dos hallazgos que sólo
// aparecieron al medir y que son los que hacen que la pantalla se vea como el diseño:
//
// 1. El borde NO es una parábola, es un ARCO DE CIRCUNFERENCIA. Se descartó la parábola comparando
//    pendientes: en el costado la referencia cae 1.83px por px y una parábola que pase por los
//    mismos tres puntos cae 1.23. El círculo da 1.95 — que con lo grueso de la medida en el borde
//    es el que encaja.
// 2. Los círculos de categoría van CENTRADOS SOBRE EL ARCO, y espaciados por igual en ÁNGULO (no en
//    horizontal). Por eso el hueco del centro se ve más ancho que los otros: el arco es más plano
//    ahí, así que el mismo ángulo abarca más pantalla.

/** Borde del verde en los COSTADOS, en proporción al ancho de pantalla. Medido: 110.9pt en 393. */
const SIDE_Y_RATIO = 110.9 / 393;
/** Borde del verde en el CENTRO. Medido: 231.0pt en 393. */
const CENTER_Y_RATIO = 231.0 / 393;

export interface Arc {
  /** Centro de la circunferencia — siempre el eje vertical de la pantalla. */
  cx: number;
  /** Centro de la circunferencia, por ENCIMA del techo de la pantalla salvo en pantallas anchas. */
  cy: number;
  r: number;
  /** Dónde termina el verde en los costados. */
  sideY: number;
  /** Dónde termina el verde en el centro — el punto más bajo de la panza. */
  centerY: number;
}

/**
 * El arco para un ancho de pantalla dado.
 *
 * Se DERIVA del ancho y no es una tabla de constantes, por la misma razón que la sangría del hub:
 * un número fijo dice cosas distintas en un SE que en un Pro Max. El arco tiene que cruzar la
 * pantalla entera, mida lo que mida.
 */
export function arcFor(width: number): Arc {
  const cx = width / 2;
  const sideY = width * SIDE_Y_RATIO;
  const centerY = width * CENTER_Y_RATIO;
  // La circunferencia que pasa por (0, sideY), (cx, centerY) y (width, sideY). Sale de igualar las
  // distancias al centro: r = centerY - cy, y de ahí se despeja cy.
  const cy = (centerY * centerY - sideY * sideY - cx * cx) / (2 * (centerY - sideY));
  return { cx, cy, r: centerY - cy, sideY, centerY };
}

/**
 * Los ángulos donde se posa cada categoría, en grados desde el punto más bajo del arco.
 *
 * Medido sobre la referencia: −45.6°, −22.4°, +23.5°, +46.5°. Separación constante de ~23° y un
 * hueco central de 46° — exactamente el doble. O sea: hay CINCO ranuras equiespaciadas y la del
 * centro se deja libre a propósito, porque ahí viven la campana y el indicador de página.
 */
export const SLOT_ANGLES = [-46, -23, 23, 46] as const;

/** Cuántas categorías se ven a la vez sobre el arco. */
export const VISIBLE_SLOTS = SLOT_ANGLES.length;

/** La separación normal entre ranuras contiguas. Medida: ~23°. */
const STEP = 23;

/**
 * El ángulo de una ranura ENTERA. La red de ranuras es infinita hacia los dos lados: …−69, −46,
 * −23, +23, +46, +69… Fíjate en que entre la 1 y la 2 hay 46° y no 23: ESE es el hueco reservado
 * para la campana, y por eso la red no es uniforme.
 */
function latticeAngle(slot: number): number {
  "worklet";
  return slot <= 1 ? -STEP + (slot - 1) * STEP : STEP + (slot - 2) * STEP;
}

/**
 * El ángulo de una posición CONTINUA de la rueda — el corazón de la ruleta.
 *
 * La rueda no salta de una configuración a otra: gira, y cada categoría viaja POR EL ARCO. Para eso
 * hace falta poder preguntar por posiciones fraccionarias, no sólo por ranuras enteras.
 *
 * Como el hueco del centro mide el doble, la categoría que lo cruza se mueve al doble de velocidad
 * angular. No es un defecto: es lo que hace que pase por debajo de la campana de un barrido en vez
 * de quedarse plantada delante.
 *
 * Es un `worklet` porque lo evalúa el hilo de UI en cada fotograma de la rotación; llamarlo desde
 * JS haría que la rueda fuese a tirones.
 */
export function angleForSlot(position: number): number {
  "worklet";
  const whole = Math.floor(position);
  const fraction = position - whole;
  const from = latticeAngle(whole);
  return from + (latticeAngle(whole + 1) - from) * fraction;
}

/**
 * Hasta dónde puede girar la rueda. Sin tope se seguiría girando hacia el vacío y las categorías
 * desaparecerían dejando el arco pelado.
 */
export function maxRotation(count: number): number {
  return Math.max(0, count - VISIBLE_SLOTS);
}

/**
 * Por dónde se abre la rueda: por el MEDIO de la lista, para que haya recorrido hacia los dos lados
 * desde el primer momento. Las dos marcas laterales del indicador prometen exactamente eso.
 */
export function initialRotation(count: number): number {
  return Math.round(maxRotation(count) / 2);
}

/** El punto del arco a un ángulo dado, medido desde el punto más bajo. */
export function pointOnArc(arc: Arc, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: arc.cx + arc.r * Math.sin(rad), y: arc.cy + arc.r * Math.cos(rad) };
}

/** Diámetro del círculo de categoría. Medido en la referencia: 59.3pt. */
export const CIRCLE_SIZE = 60;
/** Aire bajo la categoría más baja. Los círculos ya no llevan nombre debajo —se muestra en un
 *  popover al mantener oprimido—, así que sólo hace falta que el arco no quede pegado al rail. */
export const ARC_BOTTOM_PAD = 18;


/**
 * Lo que ocupa el header entero, de arriba abajo.
 *
 * Se mide contra quien CRUZA el centro, que baja hasta el fondo de la panza y cuelga más que
 * ninguna de las cuatro en reposo. Si sólo se contaran las paradas, al girar la rueda la categoría
 * que pasa se saldría del header.
 */
export function headerBlockHeight(width: number): number {
  const arc = arcFor(width);
  return arc.centerY + CIRCLE_SIZE / 2 + ARC_BOTTOM_PAD;
}




/**
 * El contorno del header como path de SVG: rectángulo con el canto inferior arqueado hacia abajo.
 *
 * Se dibuja con el comando `A` del propio SVG en vez de aproximar con Béziers — es un arco de
 * circunferencia de verdad, así que pedirle a SVG que trace ESE arco es más corto y más exacto que
 * inventarle puntos de control. `sweep=1` es lo que hace que la panza baje en vez de subir.
 */
export function headerPath(width: number): string {
  const { sideY, r } = arcFor(width);
  return `M0,0 L${width},0 L${width},${sideY} A${r},${r} 0 0,1 0,${sideY} Z`;
}
