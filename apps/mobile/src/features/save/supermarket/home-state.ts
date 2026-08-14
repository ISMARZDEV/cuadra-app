// Qué pinta la home de Supermarket según cómo vinieron sus dos consultas.
//
// Vive aparte y es PURA a propósito: es la decisión que más caro se paga si se equivoca —una
// pantalla en blanco no dice si la red falló, si no hay productos o si todavía está cargando— y es
// lo único de esta pantalla que se puede probar de verdad bajo jsdom.

export type RailQueryState = {
  isLoading: boolean;
  isError: boolean;
  count: number;
};

export type HomeState = "loading" | "error" | "empty" | "content";

/**
 * La regla, en orden:
 *
 * 1. `content` si hay ALGO que mostrar, pase lo que pase con la otra consulta. Media pantalla útil
 *    es mejor que una disculpa, y el rail que falló simplemente no se dibuja.
 * 2. `loading` mientras cualquiera siga en vuelo.
 * 3. `error` si falló CUALQUIERA de las dos y no quedó nada en pantalla.
 * 4. `empty` sólo cuando las dos respondieron BIEN y no trajeron nada.
 *
 * El punto 3 es `||`, no `&&`, y la diferencia no es cosmética: con una consulta caída y la otra
 * devolviendo cero, decir «no hay productos» sería MENTIR — no lo sabemos, parte del catálogo no
 * llegó a cargar. Sólo se puede afirmar que algo está vacío cuando se pudo mirar entero.
 *
 * (Este archivo nació con `&&` y la mutación lo destapó: el caso mixto no lo cubría ningún test
 * porque el atajo del punto 1 lo interceptaba antes. La regla estaba mal, no sólo sin probar.)
 */
export function resolveHomeState(deals: RailQueryState, featured: RailQueryState): HomeState {
  const total = deals.count + featured.count;
  if (total > 0) return "content";
  if (deals.isLoading || featured.isLoading) return "loading";
  if (deals.isError || featured.isError) return "error";
  return "empty";
}
