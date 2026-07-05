import { brandProducts, compareProduct, priceHistory } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { apiClient } from "@/lib/api";

export type ProductData = Awaited<ReturnType<typeof data>>;

// SSR: la comparación se arma en el servidor → HTML con los precios (SEO) + OG tags (+Head).
// El historial (C9) se trae completo (range=all) y el chart lo recorta por rango en el cliente;
// `nowMs` viaja desde el servidor para que los ejes de fecha no difieran en la hidratación.
export async function data(pageContext: PageContextServer) {
  const productId = pageContext.routeParams.id;
  const res = await compareProduct({ client: apiClient, query: { product_id: productId } });
  if (res.error || !res.data) {
    throw render(404, "Producto no encontrado.");
  }
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
