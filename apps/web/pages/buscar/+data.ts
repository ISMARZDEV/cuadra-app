import { searchProducts } from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import { apiClient } from "../../src/lib/api";

export type SearchData = Awaited<ReturnType<typeof data>>;

// SSR: la búsqueda se resuelve en el servidor → la página de resultados es HTML indexable.
export async function data(pageContext: PageContextServer) {
  const q = (pageContext.urlParsed.search.q ?? "").trim();
  if (!q) return { q: "", results: [] };
  const res = await searchProducts({ client: apiClient, query: { q, market: "DO" } });
  return { q, results: res.data ?? [] };
}
