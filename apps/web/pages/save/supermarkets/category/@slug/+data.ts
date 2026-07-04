import { category } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type CategoryData = Awaited<ReturnType<typeof data>>;

// SSR: la categoría (breadcrumb + subcategorías + productos) del país → indexable. 404 si el slug
// no existe (soft-404 correcto para SEO).
export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams.slug;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const res = await category({ client: apiClient, path: { slug }, query: { market } });
  if (res.error || !res.data) {
    throw render(404, "Categoría no encontrada.");
  }
  return res.data;
}
