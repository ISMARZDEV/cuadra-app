import { headerBlockHeight } from "./arc-geometry";

// DÓNDE ESTÁ LA PÍLDORA DE REPOSO, CALCULADA — no medida.
//
// De aquí arranca el viaje de la hoja del buscador. Su compañero es `search-choreography`: aquél
// dice CUÁNDO se mueve cada cosa, éste dice DESDE DÓNDE.
//
// ⚠️ POR QUÉ EXISTE. La posición se pedía al lado nativo con `measureInWindow`, y esa llamada falla
// EN FRÍO: devuelve 0 en el primer toque tras montar la pantalla. `home-search-bar` descarta esa
// medida increíble —hace bien— y guarda la última buena, pero en el primer toque no hay ninguna
// última buena: la píldora entonces llegaba sin posición, la hoja se quedaba con el `fromY` inicial
// (0) y el suelo `MIN_TRAVEL` convertía el viaje en un salto de 56px. La barra NACÍA ARRIBA.
//
// Y explica exactamente el síntoma que se reportó: falla el PRIMER toque y tras un rato sin usarlo
// —o sea, cada vez que la pantalla vuelve a montarse—, y funciona al tocarlo repetidas veces,
// porque para entonces ya hay una medida guardada.
//
// ⭐ LA LECCIÓN: esta posición NUNCA hizo falta medirla. El buscador va justo debajo del bloque del
// header, dentro de un ScrollView sin sangría superior, así que su sitio se DERIVA del ancho de la
// pantalla y de cuánto se ha desplazado la home. Preguntarle al lado nativo algo que ya sabemos
// calcular es cambiar una certeza por una carrera.

/**
 * La `y` en coordenadas de VENTANA de la píldora de reposo de la home de Supermarket.
 *
 * El bloque del header es el primer hijo del ScrollView y éste no tiene `paddingTop` —el verde
 * llega al canto de la pantalla, por debajo del reloj del sistema—, así que el buscador empieza
 * justo donde el header termina. `safeTop` no entra: sólo coloca los controles POR DENTRO del
 * verde, no empuja el bloque hacia abajo.
 */
export function homeSearchBarY({
  width,
  scrollY,
}: {
  width: number;
  /** Cuánto se ha desplazado la home. Es lo ÚNICO que la geometría no puede saber por su cuenta. */
  scrollY: number;
}): number {
  return headerBlockHeight(width) - scrollY;
}

/**
 * Desde dónde arranca el viaje de la hoja: la medida nativa si es CREÍBLE, la geometría si no.
 *
 * ⚠️ ESTE ORDEN IMPORTA Y NO ES SIMÉTRICO. La medida manda cuando existe porque es la verdad de ese
 * instante: sabe de cambios de maquetación que la fórmula no puede adivinar. Pero `measureInWindow`
 * no falla — devuelve 0, que es un fallo con disfraz de dato, y tratarlo como posición es lo que
 * ponía la barra bajo el notch. Un 0 se descarta igual que un `undefined`.
 *
 * Lo que cambia respecto a antes NO es descartar la medida mala —eso ya se hacía— sino tener algo
 * que poner en su lugar. Antes, sin medida, la pantalla simplemente no actualizaba su `fromY` y la
 * hoja viajaba desde el 0 inicial. Ahora el primer toque tiene una posición TAN BUENA como el
 * décimo, que es justo lo que se pedía.
 */
export function resolveSearchAnchor({
  measured,
  width,
  scrollY,
}: {
  /** Lo que devolvió `measureInWindow`, si devolvió algo. */
  measured: number | undefined;
  width: number;
  scrollY: number;
}): number {
  if (measured !== undefined && measured > 0) return measured;
  return homeSearchBarY({ width, scrollY });
}
