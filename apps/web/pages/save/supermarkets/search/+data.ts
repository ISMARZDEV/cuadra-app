import { searchProducts } from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type { SearchData } from "@/features/save/types";

// SSR: la búsqueda se resuelve en el servidor contra el mercado del PAÍS de la URL → resultados
// indexables por país.
export async function data(pageContext: PageContextServer) {
  const q = (pageContext.urlParsed.search.q ?? "").trim();
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  if (!q) return { q: "", results: [] };
  const res = await searchProducts({ client: apiClient, query: { q, market } });
  return { q, results: res.data ?? [] };
}
