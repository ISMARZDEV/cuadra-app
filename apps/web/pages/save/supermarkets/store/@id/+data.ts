import { storePage } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type StoreData = Awaited<ReturnType<typeof data>>;

// SSR: página propia de un supermercado (A9) — su nombre + su catálogo (precios propios,
// no el mínimo cross-tienda). 404 si el provider no existe (soft-404 correcto para SEO).
export async function data(pageContext: PageContextServer) {
  const providerId = pageContext.routeParams.id;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const res = await storePage({
    client: apiClient,
    path: { provider_id: providerId },
    query: { market },
  });
  if (res.error || !res.data) {
    throw render(404, "Tienda no encontrada.");
  }
  return res.data;
}
