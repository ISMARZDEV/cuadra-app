import { brandProducts, compareProduct, priceHistory } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { DEFAULT_COUNTRY, marketOf } from "@/i18n/config";
import { apiClient } from "@/lib/api";

export type { ProductData } from "@/features/save/types";

// SSR: la comparación se arma en el servidor → HTML con los precios (SEO) + OG tags (+Head).
// El producto se resuelve por SLUG legible (no UUID) → URL indexable + canonical. El historial
// (C9) y "más de la marca" siguen consultándose por el `canonical_product_id` que devuelve la
// comparación (llave interna). `nowMs` viaja desde el servidor para que los ejes de fecha del
// chart no difieran en la hidratación.
export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams.slug;
  const market = marketOf(pageContext.country ?? DEFAULT_COUNTRY);
  const res = await compareProduct({ client: apiClient, query: { slug, market } });
  if (res.error || !res.data) {
    throw render(404, "Producto no encontrado.");
  }
  const productId = res.data.canonical_product_id;
  const [hist, brand] = await Promise.all([
    priceHistory({ client: apiClient, query: { product_id: productId, range: "all" } }),
    brandProducts({ client: apiClient, path: { product_id: productId } }),
  ]);
  return {
    comparison: res.data,
    history: hist.data ?? null,
    brandProducts: brand.data ?? [],
    nowMs: Date.now(),
  };
}
