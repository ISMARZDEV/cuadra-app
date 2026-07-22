import { listCanonicalProducts } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { parseCanonicalProductsParams } from "@/features/admin/resources/save-canonical-products/lib/canonical-products-params";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);
  const auth = token ? { authorization: `Bearer ${token}` } : undefined;

  // Parsear parámetros de la URL (search, brand_id, taxonomy_node_id, quality_status, ean_reachable, limit, offset)
  const params = parseCanonicalProductsParams(pageContext.urlParsed.search);

  const res = await listCanonicalProducts({
    client: apiClient,
    headers: auth,
    query: {
      search: params.search,
      brand_id: params.brand_id,
      taxonomy_node_id: params.taxonomy_node_id,
      quality_status: params.quality_status,
      ean_reachable: params.ean_reachable,
      limit: params.limit,
      offset: params.offset,
    },
  });

  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar el listado de productos canónicos.");
  }

  return {
    list: res.data,
    params,
    ...shell,
  };
}

export type { AdminShellData };
