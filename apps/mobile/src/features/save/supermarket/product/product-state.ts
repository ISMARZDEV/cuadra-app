// Qué pinta el detalle de producto según cómo vino su consulta ESPINA (la comparación).
//
// Vive aparte y es PURA por la misma razón que `home-state`: es la decisión que más caro se paga
// si se equivoca, y es lo único de la pantalla que se puede probar bajo jsdom.
//
// ⭐ La regla NO es la de la home, y la diferencia es de fondo. Allí las dos consultas eran
// HERMANAS —dos rails, cualquiera de los dos vale una pantalla—. Aquí hay una espina y unas
// costillas: sin la comparación no hay nombre, ni precio, ni producto que enseñar; pero el
// historial, los similares y «más de la marca» son secciones que se pintan solas y FALLAN solas.
// Que se caiga el chart no puede tumbar el precio, así que no entran en esta decisión: cada una
// resuelve su propio hueco donde está dibujada.

export type DetailQueryState = {
  isLoading: boolean;
  isError: boolean;
  /** Código HTTP del fallo, cuando se conoce. Es lo que separa «no existe» de «no se pudo». */
  status?: number;
  hasData: boolean;
};

export type ProductState = "loading" | "error" | "notFound" | "empty" | "content";

/**
 * En orden:
 *
 * 1. `content` en cuanto hay datos.
 * 2. `loading` mientras viaja — y GANA a un error viejo, porque TanStack conserva `isError`
 *    durante el reintento y si no, tocar «reintentar» parecería no hacer nada.
 * 3. `notFound` si el servidor dijo 404. Es un estado distinto porque la SALIDA es distinta: de un
 *    fallo de red se reintenta, de un producto que no existe se vuelve atrás. Ofrecer
 *    «reintentar» para algo que no va a aparecer es enviar al usuario a un bucle.
 * 4. `error` para cualquier otro fallo.
 * 5. `empty` sólo cuando respondió BIEN y no trajo nada: un canónico sin tiendas es un estado
 *    legítimo del catálogo, no una avería.
 */
export function resolveProductState(comparison: DetailQueryState): ProductState {
  if (comparison.hasData) return "content";
  if (comparison.isLoading) return "loading";
  if (comparison.isError) return comparison.status === 404 ? "notFound" : "error";
  return "empty";
}
