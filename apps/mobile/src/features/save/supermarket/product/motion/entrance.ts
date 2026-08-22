import { Easing, type WithTimingConfig } from "react-native-reanimated";

// La cascada con la que entra el detalle: el contenido se revela de arriba abajo.
//
// MEDIDO en la ventana w1 del clip de referencia (`frames/w1_04083-04317ms`): 134 ms de movimiento
// vivo, revelando en orden nombre → tamaño → precio → señales → valoración → descripción.

/** Desplazamiento de la ventana de cada escalón dentro del progreso total (0-1). */
export const STEP = 0.085;
/** Cuánto dura la entrada de UN escalón, en fracción del progreso total. */
export const SPAN = 0.34;

/**
 * Duración total, DERIVADA: si un escalón debe durar los 134 ms medidos y ocupa `SPAN` del reloj,
 * el reloj entero mide `134 / SPAN`. Escribirla a ojo y ajustar hasta que «se vea bien» es cómo se
 * pierde el vínculo con la medición.
 */
const MEASURED_STEP_MS = 134;
export const ENTRANCE_MS = Math.round(MEASURED_STEP_MS / SPAN);

/**
 * Los bloques que entran en cascada, en el ORDEN EN QUE SE LEEN de arriba abajo.
 *
 * Vive aquí y no en un componente porque ya no lo usa uno solo: la cabecera pone los seis primeros
 * y la pantalla pone los dos últimos. Con el reparto repartido, dos bloques acabarían compartiendo
 * puesto —entran a la vez, y eso no se ve: se lee como que «ahí la cascada va rápida»—.
 *
 * ⚠️ OCHO ES EL TECHO con `STEP` 0.085 y `SPAN` 0.34: el noveno terminaría en 1.02 y nunca llegaría
 * a opacidad plena. Añadir uno más obliga a recortar `STEP` o `SPAN`, y eso cambia la cadencia
 * MEDIDA. El test lo sujeta.
 */
export const STEPS = {
  /** La foto, en su tarjeta blanca montada sobre el verde del header. */
  Photo: 0,
  /** Nombre + marca · moneda · tamaño. */
  Identity: 1,
  /** Precio de hoy, precio de antes y sus unitarios. */
  Price: 2,
  /** «Comprar en la tienda» + el enlace del súper. */
  Actions: 3,
  /** La franja de Cuadra: tendencia y ahorro. */
  Insight: 4,
  /** La prosa comercial del producto. */
  Description: 5,
  /** «Otras tiendas»: el titular, las tiles y las filas. Lo pone la pantalla, no la cabecera. */
  StorePanel: 6,
  /** El histórico de precios. */
  History: 7,
} as const;

export const STEP_COUNT = Object.keys(STEPS).length;

/** Dónde termina la ventana del último escalón. Debe caber en el reloj o ese bloque no llega a 1. */
export function lastStepEndsAt(steps: number): number {
  return (steps - 1) * STEP + SPAN;
}

/**
 * El horario de la cascada en MILISEGUNDOS REALES: cuándo empieza y cuándo aterriza cada bloque.
 *
 * ⭐ Existe porque `STEP` y `SPAN` están en PROGRESO, y el usuario no vive el progreso: vive el
 * reloj de pared. Entre los dos hay una curva, y mientras esa curva no fue la identidad la
 * traducción no era la que dice la aritmética de arriba. Esta función es la única forma de afirmar
 * en un test lo que de verdad se ve, y sólo es cierta con el reloj LINEAL — ver `ENTRANCE_TIMING`.
 */
export function stepScheduleMs(steps: number): Array<{ start: number; end: number }> {
  return Array.from({ length: steps }, (_, i) => ({
    start: i * STEP * ENTRANCE_MS,
    end: (i * STEP + SPAN) * ENTRANCE_MS,
  }));
}

/**
 * ⭐ LINEAL A PROPÓSITO, y esto no es una preferencia: es la condición para que la cascada exista.
 *
 * La curva de cada escalón la pone su propia VENTANA en `cascade-item`. Metiendo una segunda curva
 * aquí, en el reloj compartido, los escalones del medio se amontonan y los de los extremos se
 * separan — la regla ya estaba escrita en `search/search-overlay.tsx`, el primer consumidor de
 * `CascadeItem`, y esta pantalla la rompió igual.
 *
 * Lo que costó, medido en el simulador con kimógrafo a 60 fps sobre `Easing.bezier(0.2, 0, 0, 1)`:
 * esa curva llega a progreso 0.765 —donde acaba el último bloque— a los 143 ms de un reloj de
 * 394 ms. Resultado real: cada escalón duraba 58 ms en vez de los 134 medidos, el desfase entre
 * bloques se quedaba en 8-11 ms (medio fotograma a 60 fps) y los 251 ms restantes del reloj no
 * animaban nada. Los seis bloques caían en el mismo repintado: se leía como «todo a la vez», que
 * es justo lo que una cascada existe para no ser.
 *
 * Con el reloj lineal el escalonado vuelve a ser el medido: 134 ms por bloque, 33 ms de desfase.
 */
export const ENTRANCE_TIMING: WithTimingConfig = {
  duration: ENTRANCE_MS,
  easing: Easing.linear,
};

/**
 * La IDENTIDAD que decide cuándo se repite la entrada. Se usa como `key` de la cabecera: cuando
 * cambia, React la remonta y la cascada arranca desde cero.
 *
 * ⭐ Hace falta porque saltar de un producto a otro NO desmonta la pantalla. `openProduct` hace
 * `router.replace` sobre la MISMA ruta, así que el árbol se conserva y sólo cambia el `slug` — el
 * efecto que arranca el reloj tiene deps `[cascade, reducedMotion]` y nunca vuelve a dispararse.
 * Medido en el simulador con los dos productos ya en caché: entre 2,0 y 3,0 s de la grabación
 * había 3 fotogramas distintos, los tres dentro de 6 ms. El contenido cambiaba de golpe.
 *
 * ⭐⭐ Y se remonta en vez de reiniciar el reloj a mano, que era lo obvio y es lo equivocado:
 * escribir `cascade.value = 0` desde JS no escribe, ENCOLA (`cuadra-motion` §1), así que existe un
 * fotograma en el que el producto nuevo ya está pintado a opacidad PLENA con el reloj todavía en 1
 * del anterior. Se vería un parpadeo, que es peor que no animar. Remontando, el estado de reposo
 * sale de la maquetación: `useSharedValue(0)` nace en 0 y el updater de la primera pasada de
 * `useAnimatedStyle` ya lo lee así.
 *
 * ⭐ La identidad sale de los DATOS, no de la ruta. El `slug` cambia ANTES de que llegue la
 * comparación del producto nuevo; colgando de él, la cascada correría sobre el contenido del
 * producto ANTERIOR —que es lo que sigue en pantalla— y el nuevo entraría luego sin animar.
 *
 * ⭐⭐ Y lleva la VISITA, porque **la entrada pertenece a la LLEGADA, no al producto**. Colgando
 * sólo del producto, volver por segunda vez al MISMO daba la misma key: sin cambio de key no hay
 * remonte, y sin remonte el reloj se queda donde lo dejó la primera vez —en 1, con todo puesto—.
 * Son dos causas INDEPENDIENTES y ninguna sustituye a la otra: saltar por los raíles de
 * «similares» cambia de producto sin salir de la pantalla (no hay llegada nueva), y volver a
 * entrar cambia de llegada sin cambiar de producto.
 */
export function entranceKeyOf(
  canonicalProductId: string | null | undefined,
  slug: string,
  visit = 0,
): string {
  // El separador NO es decorativo. Con `id + visit` a secas, «canon-1» en la visita 2 y «canon-2»
  // en la visita 1 darían la misma cadena y una de las dos entradas se perdería en silencio.
  return `${canonicalProductId ?? `slug:${slug}`}#${visit}`;
}
