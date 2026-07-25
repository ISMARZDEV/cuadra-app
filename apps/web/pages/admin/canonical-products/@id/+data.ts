import {
  getCanonicalProduct,
  listCanonicalProductAuditLog,
  listCanonicalProductDuplicates,
  listCanonicalProductEvidence,
  listCanonicalProductProviders,
  listTaxonomyLeaves,
} from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../../+data";

// Detalle SSR del canónico (US-CP-D1). NO hay `+guard.ts` propio a propósito: en vike la config
// se hereda, y el guard de `pages/admin/canonical-products/` cubre esta subruta — es el mismo
// patrón que `review-queue/@id`. Agregar uno acá sería duplicar la misma capability.
//
// El histórico NO se pide en el SSR: su rango es interactivo y arrancarlo desde el servidor
// obligaría a elegir uno "por defecto" que el operador cambiaría de inmediato.
export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const id = pageContext.routeParams.id;
  const path = { canonical_product_id: id };

  const detail = await getCanonicalProduct({ client: apiClient, headers, path });
  if (detail.error || !detail.data) {
    throw render(404, "Producto canónico no encontrado.");
  }

  // En paralelo: los tres paneles de sólo lectura del detalle.
  const [providers, evidence, duplicates, auditLog, taxonomy] = await Promise.all([
    listCanonicalProductProviders({ client: apiClient, headers, path }),
    listCanonicalProductEvidence({ client: apiClient, headers, path }),
    listCanonicalProductDuplicates({ client: apiClient, headers, path }),
    listCanonicalProductAuditLog({ client: apiClient, headers, path }),
    // Hojas de taxonomía para el selector de categoría del modal de edición (US-CP-D2).
    listTaxonomyLeaves({ client: apiClient, headers }),
  ]);

  return {
    product: detail.data,
    providers: providers.data ?? [],
    evidence: evidence.data ?? [],
    duplicates: duplicates.data ?? [],
    auditLog: auditLog.data ?? [],
    taxonomyLeaves: taxonomy.data?.leaves ?? [],
    ...shell,
  };
}

export type { AdminShellData };
