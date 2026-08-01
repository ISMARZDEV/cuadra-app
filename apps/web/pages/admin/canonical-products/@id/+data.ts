import {
  getCanonicalProduct,
  getCanonicalProductCursor,
  listCanonicalProductAuditLog,
  listCanonicalImages,
  listCanonicalProductDuplicates,
  listCanonicalProductEvidence,
  listCanonicalProductProviders,
  listTaxonomyLeaves,
  suggestCanonicalCategories,
} from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { parseCanonicalProductsParams } from "@/features/admin/resources/save-canonical-products/lib/canonical-products-params";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../../+data";

// Detalle SSR del canónico (US-CP-D1). NO hay `+guard.ts` propio a propósito: en vike la config
// se hereda, y el guard de `pages/admin/canonical-products/` cubre esta subruta — es el mismo
// patrón que `review-queue/@id`. Agregar uno acá sería duplicar la misma capability.
//
// El histórico NO se pide en el SSR: su rango es interactivo y arrancarlo desde el servidor
// obligaría a elegir uno "por defecto" que el operador cambiaría de inmediato.
//
// El cursor (position + prev/next) se resuelve server-side con los filtros que vienen en la URL:
// así el pager llega renderizado y consistente con la lista que trajo al operador.
export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const id = pageContext.routeParams.id;
  const path = { canonical_product_id: id };
  const params = parseCanonicalProductsParams(pageContext.urlParsed.search);

  const [detail, cursorRes] = await Promise.all([
    getCanonicalProduct({ client: apiClient, headers, path }),
    getCanonicalProductCursor({
      client: apiClient,
      headers,
      path,
      query: {
        search: params.search ?? null,
        brand_id: params.brand_id ?? null,
        taxonomy_node_id: params.taxonomy_node_id ?? null,
        quality_status: params.quality_status ?? null,
        ean_reachable: params.ean_reachable ?? null,
        min_provider_count: params.min_provider_count ?? null,
        updated_since: params.updated_since ?? null,
        include_archived: params.include_archived ?? false,
        sort: params.sort ?? "name",
      } as never,
    }),
  ]);

  if (detail.error || !detail.data) {
    throw render(404, "Producto canónico no encontrado.");
  }

  const cursor = cursorRes.error
    ? { total: 0, position: null, previous_id: null, next_id: null }
    : (cursorRes.data ?? { total: 0, position: null, previous_id: null, next_id: null });

  // En paralelo: los tres paneles de sólo lectura del detalle.
  const [providers, evidence, duplicates, auditLog, taxonomy, suggestions, images] =
    await Promise.all([
      listCanonicalProductProviders({ client: apiClient, headers, path }),
      listCanonicalProductEvidence({ client: apiClient, headers, path }),
      listCanonicalProductDuplicates({ client: apiClient, headers, path }),
      listCanonicalProductAuditLog({ client: apiClient, headers, path }),
      // Hojas de taxonomía para el selector de categoría del modal de edición (US-CP-D2).
      listTaxonomyLeaves({ client: apiClient, headers }),
      // Sugerencias de categoría (US-CP-D2c): deterministas y baratas, así que viajan con el SSR
      // en vez de costar un request extra al abrir el picker.
      suggestCanonicalCategories({ client: apiClient, headers, path }),
      listCanonicalImages({ client: apiClient, headers, path }),
    ]);

  return {
    product: detail.data,
    providers: providers.data ?? [],
    evidence: evidence.data ?? [],
    duplicates: duplicates.data ?? [],
    auditLog: auditLog.data ?? [],
    taxonomyLeaves: taxonomy.data?.leaves ?? [],
    categorySuggestions: suggestions.data ?? [],
    images: images.data ?? [],
    params,
    cursor,
    ...shell,
  };
}

export type { AdminShellData };

// Re-exportado para que `+title.ts` / `+Head.tsx` puedan importar desde `./+data` sin
// depender hacia atrás del feature.
export type { CanonicalDetailData } from "@/features/admin/resources/save-canonical-products/interfaces";
