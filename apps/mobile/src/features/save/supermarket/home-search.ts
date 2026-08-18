// El puente entre el buscador de la HOME y la búsqueda de verdad, que vive en la rejilla.
//
// El buscador de la home es un campo REAL —se escribe en él—, pero no busca donde está: al enviar
// lleva a la rejilla con lo escrito ya aplicado. Y es a propósito. La rejilla es la que sabe buscar
// en el servidor (`useSearchProductCards`), la que pagina el resultado y la que tiene sitio para
// enseñarlo en tres columnas; duplicar todo eso en la home sería mantener dos buscadores que
// tienen que responder igual. Aquí se escribe, allá se busca.
//
// Vive aparte y es PURO porque construir la URL a mano en el JSX es justo donde se cuelan los
// defectos que nadie ve hasta producción: un `&` sin escapar parte la consulta en dos parámetros,
// y un `q` vacío deja la rejilla creyéndose «buscando» y pintando «sin resultados» sobre un
// catálogo lleno.

/** La rejilla, sin búsqueda. `featured` es el catálogo general: buscar no viene de un rail. */
const BROWSE = "/save/supermarket/browse?origin=featured";

/**
 * A dónde lleva enviar el buscador de la home.
 *
 * Los espacios de dentro se colapsan a uno: «arroz   selecto» y «arroz selecto» son la misma
 * búsqueda, y mandarlas distintas parte la caché de la consulta en dos entradas que traen lo mismo.
 */
export function browseSearchHref(query: string): string {
  const needle = query.trim().replace(/\s+/g, " ");
  if (!needle) return BROWSE;
  return `${BROWSE}&q=${encodeURIComponent(needle)}`;
}
