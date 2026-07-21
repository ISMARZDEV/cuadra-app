import type { AdminReviewQueueRowDto, BulkResolveResultDto } from "@cuadra/api-client";
import {
  bulkClassifyReview,
  bulkCreateCanonicals,
  bulkResolveReview,
  createCanonicalAndLink,
  listTaxonomyLeaves,
  setProductCategory,
  listReviewQueue,
  resolveReview,
  reviewDetail,
} from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

import { ADMIN_DECIDED_BY } from "./lib/decided-by";

import type { ReviewQueueParams } from "./types";

// Mutaciones client-side (click del revisor) — MISMO mecanismo de auth que el resto de la app
// (`authHeaders()`, token async de Clerk: nunca reusar el `extractToken` SSR de `require-admin.ts`,
// son canales de auth distintos — cuadra-clerk: "short-lived-token / async token-getter rule").
export async function resolveReviewMatch(params: {
  matchId: string;
  canonicalProductId: string | null;
  decidedBy: string;
  reasonCode?: string;
  reasonNote?: string;
}) {
  return resolveReview({
    client: apiClient,
    headers: await authHeaders(),
    path: { match_id: params.matchId },
    body: {
      canonical_product_id: params.canonicalProductId,
      decided_by: params.decidedBy,
      reason_code: params.reasonCode ?? null,
      reason_note: params.reasonNote ?? null,
    },
  });
}

export interface BulkResolveRowInput {
  matchId: string;
  canonicalProductId: string | null;
  decidedBy: string;
  reasonCode?: string;
  reasonNote?: string;
}

// Bulk-resolve (feature #10, batch 2e / 2.23-2.24): UN request al endpoint atómico-por-fila del
// backend (`BulkResolveReview`, 1.24/1.25) — nunca N requests sueltos ni una reimplementación del
// invariante same-tx en el cliente (SACRED, cuadra-save-matching). `null` en caso de error de red
// (el llamador decide cómo reportarlo); el `succeeded`/`failed` de una respuesta OK ya viaja
// completo — nunca se descarta un fallo parcial silenciosamente.
export async function bulkResolveReviewMatches(
  rows: BulkResolveRowInput[],
): Promise<BulkResolveResultDto | null> {
  const res = await bulkResolveReview({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      rows: rows.map((r) => ({
        match_id: r.matchId,
        canonical_product_id: r.canonicalProductId,
        decided_by: r.decidedBy,
        reason_code: r.reasonCode ?? null,
        reason_note: r.reasonNote ?? null,
      })),
    },
  });
  if (res.error || !res.data) return null;
  return res.data;
}

/** El candidato TOP (mayor score) de un match, o `null` si no tiene candidatos o falló la consulta.
 * Usado por el bulk-approve de la lista (batch 2e): la lista solo trae `candidate_count` (un
 * número), nunca el id del candidato — aprobar en bulk sin ver a qué canónico se enlaza sería
 * arriesgar el falso-merge que `cuadra-save-matching` marca como el peor caso; por eso se resuelve
 * el detalle de cada fila seleccionada antes de enlazar, igual candidato "top" que usa el atajo de
 * teclado `a` en la pantalla de detalle (mismo orden: `list_candidates` ya lo entrega por score desc). */
export async function fetchTopCandidateId(matchId: string): Promise<string | null> {
  const res = await reviewDetail({
    client: apiClient,
    headers: await authHeaders(),
    path: { match_id: matchId },
  });
  if (res.error || !res.data) return null;
  const [top] = res.data.candidates ?? [];
  return top?.canonical_product_id ?? null;
}

/** Refetch client-side de la página vigente de la cola (Batch 6): reemplaza el
 * `window.location.reload()` post-bulk-mutación de `ReviewQueueListScreen` — `useAdminList` llama
 * a esto con los MISMOS `params` que resolvieron el SSR inicial (filtros/orden/paginación no
 * cambian por una mutación), así el `total` se ajusta sin recargar la página. `null` en caso de
 * error de red (mismo contrato que el resto de este archivo: nunca lanza, el llamador decide). */
export async function fetchReviewQueue(
  params: ReviewQueueParams,
): Promise<{ rows: AdminReviewQueueRowDto[]; total: number } | null> {
  const res = await listReviewQueue({
    client: apiClient,
    headers: await authHeaders(),
    query: {
      market: params.market,
      provider_id: params.provider_id,
      method: params.method,
      confidence_min: params.confidence_min,
      confidence_max: params.confidence_max,
      run_id: params.run_id,
      order_by: params.order_by,
      limit: params.limit,
      offset: params.offset,
    },
  });
  if (res.error || !res.data) return null;
  return { rows: res.data.rows, total: res.data.total };
}

export async function createCanonicalAndLinkMatch(params: {
  matchId: string;
  decidedBy: string;
  name: string;
  brand: string;
  quantityAmount: number;
  quantityMeasure: "mass" | "volume" | "count";
  taxonomyNodeId: string;
  marketId: string;
}) {
  return createCanonicalAndLink({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      match_id: params.matchId,
      decided_by: params.decidedBy,
      name: params.name,
      brand: params.brand,
      quantity_amount: params.quantityAmount,
      quantity_measure: params.quantityMeasure,
      taxonomy_node_id: params.taxonomyNodeId,
      market_id: params.marketId,
    },
  });
}


/** Hojas de la taxonomía CON su id — el endpoint público `/save/categories` solo da slugs, y fijar
 * una categoría necesita el `taxonomy_node_id`. */
export async function fetchTaxonomyLeaves() {
  const res = await listTaxonomyLeaves({ client: apiClient, headers: await authHeaders() });
  return res.data?.leaves ?? [];
}

/** Override HUMANO de la categoría de un store_product. `false` = el servidor la rechazó (la celda
 * revierte su valor optimista). */
export async function setStoreProductCategory(
  storeProductId: string,
  taxonomyNodeId: string,
): Promise<boolean> {
  const res = await setProductCategory({
    client: apiClient,
    headers: await authHeaders(),
    path: { store_product_id: storeProductId },
    body: { taxonomy_node_id: taxonomyNodeId, decided_by: ADMIN_DECIDED_BY },
  });
  return !res.error;
}

/** Clasifica en lote lo seleccionado. Devuelve el resumen de TRES estados (clasificadas / sin
 * decidir / con error) — fundir los dos últimos haría que un lote a medias se lea como terminado. */
export async function classifySelected(matchIds: string[]) {
  const res = await bulkClassifyReview({
    client: apiClient,
    headers: await authHeaders(),
    body: { match_ids: matchIds },
  });
  return res.data ?? null;
}


/** Convierte en canónicos las filas seleccionadas. `fallbackTaxonomyNodeId` llena SOLO los huecos:
 * nunca pisa una categoría ya decidida (la regla vive en el use case del backend). */
export async function createCanonicalsFromSelection(
  matchIds: string[],
  fallbackTaxonomyNodeId: string | null,
  overrides: Record<string, string> = {},
) {
  const res = await bulkCreateCanonicals({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      match_ids: matchIds,
      fallback_taxonomy_node_id: fallbackTaxonomyNodeId,
      overrides,
      decided_by: ADMIN_DECIDED_BY,
    },
  });
  return res.data ?? null;
}
