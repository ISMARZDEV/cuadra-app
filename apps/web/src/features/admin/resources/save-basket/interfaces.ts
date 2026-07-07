import type { BasketQueryDto } from "@cuadra/api-client";

/** Datos SSR de `pages/admin/basket-queries/+data.ts`: la canasta curada completa (213 queries de
 * DO tras el backfill de batch 3D). Endpoint admin gateado igual que `SourcesData` — la llamada
 * SSR va con token de sesión. */
export interface BasketQueriesData {
  entries: BasketQueryDto[];
}
