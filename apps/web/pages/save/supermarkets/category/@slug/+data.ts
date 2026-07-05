import { categoryProducts, listCategories } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_SORT, PAGE_SIZE } from "@/features/save/enums";
import { asList } from "@/features/save/lib/query";
import type { CategoryData } from "@/features/save/types";
import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

// SSR: el listado por categoría (breadcrumb + subcats + cards + facetas) se arma en el servidor
// con los FILTROS de la URL (?stores=…&brands=…&pmin=…&pmax=…&sort=…&view=…&page=…) → estado
// filtrable, indexable y compartible. 404 si el slug no existe (soft-404 correcto para SEO).
// `categories` (las 15 tope) alimenta el sidebar de la plantilla Overview. El tipo `CategoryData`
// y `PAGE_SIZE` viven en el feature (los consume el screen sin depender de pages/).
//
// Vista de resultados (elegible en CategoryFilters):
// - "loadmore" (default): SSR trae SOLO el primer batch (offset=0); el cliente acumula más.
// - "pages" (?view=pages&page=N): paginación numerada, offset=(page-1)*PAGE_SIZE, cada página SSR.
export async function data(pageContext: PageContextServer): Promise<CategoryData> {
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
        stores: asList(s.stores),
        brands: asList(s.brands),
        price_min: s.pmin ? Number(s.pmin) : undefined,
        price_max: s.pmax ? Number(s.pmax) : undefined,
        sort: s.sort ?? DEFAULT_SORT,
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
