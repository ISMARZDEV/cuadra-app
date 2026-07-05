import { categoryProducts, listCategories } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type CategoryData = Awaited<ReturnType<typeof data>>;

export const PAGE_SIZE = 40; // calca el batch de la referencia (4 col × 10 filas)

const list = (v: string | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

// SSR: el listado por categoría (breadcrumb + subcats + cards + facetas) se arma en el servidor
// con los FILTROS de la URL (?stores=…&brands=…&pmin=…&pmax=…&sort=…&view=…&page=…) → estado
// filtrable, indexable y compartible. 404 si el slug no existe (soft-404 correcto para SEO).
// `categories` (las 15 tope) alimenta el sidebar de la plantilla Overview.
//
// Vista de resultados (elegible en CategoryFilters, doc "Vista de resultados"):
// - "loadmore" (default, sin ?view en la URL): SSR trae SOLO el primer batch (offset=0); el
//   cliente acumula más al hacer clic en "Ver más" (fetch client-side, sin re-navegar).
// - "pages" (?view=pages&page=N): paginación numerada tradicional, offset=(page-1)*PAGE_SIZE,
//   cada página es su propio SSR (compartible/indexable, como el resto de filtros).
export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams.slug;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const s = pageContext.urlParsed.search;
  const page = s.view === "pages" ? Math.max(1, Number(s.page) || 1) : 1;
  const offset = s.view === "pages" ? (page - 1) * PAGE_SIZE : 0;
  const [res, cats] = await Promise.all([
    categoryProducts({
      client: apiClient,
      path: { slug },
      query: {
        market,
        stores: list(s.stores),
        brands: list(s.brands),
        price_min: s.pmin ? Number(s.pmin) : undefined,
        price_max: s.pmax ? Number(s.pmax) : undefined,
        sort: s.sort ?? "price",
        limit: PAGE_SIZE,
        offset,
      },
    }),
    listCategories({ client: apiClient, query: { market } }),
  ]);
  if (res.error || !res.data) {
    throw render(404, "Categoría no encontrada.");
  }
  return { ...res.data, categories: cats.data?.categories ?? [], page };
}
