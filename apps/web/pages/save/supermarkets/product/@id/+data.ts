import { compareProduct } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { apiClient } from "@/lib/api";

export type ProductData = Awaited<ReturnType<typeof data>>;

// SSR: la comparación se arma en el servidor → HTML con los precios (SEO) + OG tags (+Head).
export async function data(pageContext: PageContextServer) {
  const productId = pageContext.routeParams.id;
  const res = await compareProduct({ client: apiClient, query: { product_id: productId } });
  if (res.error || !res.data) {
    throw render(404, "Producto no encontrado.");
  }
  return res.data;
}
