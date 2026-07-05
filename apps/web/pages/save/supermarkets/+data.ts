import {
  featuredProducts,
  listCategories,
  listCollections,
  listProviders,
  todaysDeals,
} from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type { SupermarketsData } from "@/features/save/types";

// SSR: categorías reales (fila con íconos) + rails de la home (ofertas del día, populares,
// ofertas por supermercado y mejor valor por precio/unidad), todo indexable.
export async function data(pageContext: PageContextServer) {
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const [cats, deals, popular, providers, bestValue, collections] = await Promise.all([
    listCategories({ client: apiClient, query: { market } }),
    todaysDeals({ client: apiClient, query: { market, limit: 12 } }),
    featuredProducts({ client: apiClient, query: { market, sort: "popular", limit: 12 } }),
    listProviders({ client: apiClient, query: { market } }),
    featuredProducts({ client: apiClient, query: { market, sort: "unit_price", limit: 12 } }),
    listCollections({ client: apiClient, query: { market } }),
  ]);
  return {
    categories: cats.data?.categories ?? [],
    deals: deals.data ?? [],
    popular: popular.data ?? [],
    providers: providers.data ?? [],
    bestValue: bestValue.data ?? [],
    collections: collections.data ?? [],
  };
}
