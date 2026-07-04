import { featuredProducts, listCategories } from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type SupermarketsData = Awaited<ReturnType<typeof data>>;

// SSR: categorías reales (fila con íconos) + rails de la home (Mejor valor por precio/unidad y
// Populares por disponibilidad en tiendas), todo indexable.
export async function data(pageContext: PageContextServer) {
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const [cats, bestValue, popular] = await Promise.all([
    listCategories({ client: apiClient, query: { market } }),
    featuredProducts({ client: apiClient, query: { market, sort: "unit_price", limit: 12 } }),
    featuredProducts({ client: apiClient, query: { market, sort: "popular", limit: 12 } }),
  ]);
  return {
    categories: cats.data?.categories ?? [],
    bestValue: bestValue.data ?? [],
    popular: popular.data ?? [],
  };
}
