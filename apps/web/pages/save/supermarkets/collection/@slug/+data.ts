import { collectionPage } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type { CollectionData } from "@/features/save/types";

// SSR: página propia de una colección curada (A6) — su nombre + TODOS sus productos hand-pick.
// 404 si la colección no existe (soft-404 correcto para SEO).
export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams.slug;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const res = await collectionPage({
    client: apiClient,
    path: { slug },
    query: { market },
  });
  if (res.error || !res.data) {
    throw render(404, "Colección no encontrada.");
  }
  return res.data;
}
