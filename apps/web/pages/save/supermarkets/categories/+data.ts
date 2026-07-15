import { listCategories } from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type { CategoriesData } from "@/features/save/types";

// SSR: el árbol de categorías del país → indexable.
export async function data(pageContext: PageContextServer) {
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const res = await listCategories({ client: apiClient, query: { market } });
  return { categories: res.data?.categories ?? [] };
}
