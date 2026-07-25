import { listCanonicalProducts } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { parseCanonicalProductsParams } from "@/features/admin/resources/save-canonical-products/lib/canonical-products-params";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

// Listado SSR del catálogo canónico: la primera pantalla llega renderizada con datos reales, y el
// estado de filtros sale de la URL para que un link compartido reproduzca exactamente la misma
// vista (US-CP-L1/L2).
export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);
  const auth = token ? { authorization: `Bearer ${token}` } : undefined;

  const params = parseCanonicalProductsParams(pageContext.urlParsed.search);

  const res = await listCanonicalProducts({
    client: apiClient,
    headers: auth,
    // `quality_status` llega como string libre desde la URL y el enum del cliente generado es más
    // estricto. Validarlo acá duplicaría la lista de estados en un tercer lugar: el backend ya
    // rechaza un valor inválido con 422.
    query: {
      search: params.search,
      brand_id: params.brand_id,
      taxonomy_node_id: params.taxonomy_node_id,
      quality_status: params.quality_status,
      ean_reachable: params.ean_reachable,
      min_provider_count: params.min_provider_count,
      updated_since: params.updated_since,
      include_archived: params.include_archived,
      sort: params.sort,
      limit: params.limit,
      offset: params.offset,
    } as never,
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
