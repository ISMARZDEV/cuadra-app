/**
 * CUÁNDO ha terminado de llegar la pantalla — que no es lo mismo que cuándo montó su contenido.
 *
 * ⭐ Este módulo existe por un defecto que costó varias rondas de medición. La cascada de entrada
 * arrancaba al montar, y así sólo se veía la PRIMERA vez que abrías un producto: entonces los datos
 * vienen fríos, la pantalla llega, se queda en «cargando» y el contenido monta ~220 ms después, con
 * lo que la cascada corría sobre una pantalla ya quieta.
 *
 * Con los datos en caché —o sea, SIEMPRE a partir de la segunda vez— el contenido monta en el MISMO
 * commit que la pantalla, y los 394 ms de cascada se gastan MIENTRAS ésta se desliza hacia dentro.
 * Al posarse ya estaba todo puesto: animó donde nadie estaba mirando. El usuario lo describió, con
 * toda la razón, como «aparece puesta, sin nada», y fallaba por los CUATRO caminos de entrada.
 *
 * ⚠️ **No se usan los eventos de navegación, y no por gusto.** Se probó con
 * `navigation.addListener("transitionStart" | "transitionEnd")` y COMPROBADO en el simulador que
 * NUNCA llegan en esta pila: con el plazo subido a 3 s, a 1,2 s de entrar la pantalla seguía vacía,
 * lo que sólo puede pasar si el único disparador era el plazo. Un evento que no llega no es una
 * señal, es una espera.
 */

/**
 * Cuánto tarda una pantalla de pila en terminar de deslizarse hacia dentro.
 *
 * MEDIDO en el simulador siguiendo el borde de la pantalla entrante fotograma a fotograma: entra
 * sobre los 2475 ms y se posa sobre los 2800, unos 325 ms. 380 deja margen. Es un tiempo de iOS, no
 * nuestro: no se configura desde aquí, así que se mide y se anota de dónde salió el número.
 *
 * ⚠️ **ÉSTE es el número a subir si la entrada todavía se ve «ya puesta» en el dispositivo.** Es el
 * único mando de todo el mecanismo, y no se pudo cerrar mejor desde el simulador: `simctl` no toca
 * la pantalla, así que las llegadas se fuerzan con enlaces profundos, y por ahí la pantalla monta
 * ANTES de que empiece el deslizamiento — un margen que con un toque de verdad casi no existe.
 */
export const ARRIVAL_SLIDE_MS = 380;

/**
 * Cuánto hay que esperar TODAVÍA para que la pantalla esté quieta, dado lo que lleva montada.
 *
 * ⭐ Se cuenta desde que montó LA PANTALLA, no desde que montó el contenido, y ahí está toda la
 * gracia: los tres casos salen del mismo resta sin que nadie tenga que preguntar por qué camino se
 * ha entrado.
 *
 * - Datos en caché: el contenido monta con la pantalla → espera el deslizamiento entero.
 * - Datos fríos: el contenido monta a mitad del deslizamiento → espera sólo lo que falte.
 * - Volver de otra pestaña: la pantalla lleva montada una eternidad → no espera nada, porque no
 *   hay nada que esperar; ahí no se desliza ninguna pantalla.
 */
export function settleDelayMs(msSinceScreenMounted: number): number {
  if (!Number.isFinite(msSinceScreenMounted) || msSinceScreenMounted < 0) return ARRIVAL_SLIDE_MS;
  return Math.max(0, ARRIVAL_SLIDE_MS - msSinceScreenMounted);
}
