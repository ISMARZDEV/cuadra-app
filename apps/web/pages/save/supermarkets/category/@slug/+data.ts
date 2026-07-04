import { categoryProducts } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type CategoryData = Awaited<ReturnType<typeof data>>;

const list = (v: string | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

// SSR: el listado por categoría (breadcrumb + subcats + cards + facetas) se arma en el servidor
// con los FILTROS de la URL (?stores=…&brands=…&pmin=…&pmax=…&sort=…) → estado filtrable,
// indexable y compartible. 404 si el slug no existe (soft-404 correcto para SEO).
export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams.slug;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const s = pageContext.urlParsed.search;
  const res = await categoryProducts({
    client: apiClient,
    path: { slug },
    query: {
      market,
      stores: list(s.stores),
      brands: list(s.brands),
      price_min: s.pmin ? Number(s.pmin) : undefined,
      price_max: s.pmax ? Number(s.pmax) : undefined,
      sort: s.sort ?? "price",
    },
  });
  if (res.error || !res.data) {
    throw render(404, "Categoría no encontrada.");
  }
  return res.data;
}
