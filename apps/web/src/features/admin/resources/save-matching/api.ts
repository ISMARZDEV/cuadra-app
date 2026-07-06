import type { BulkResolveResultDto } from "@cuadra/api-client";
import { bulkResolveReview, createCanonicalAndLink, resolveReview, reviewDetail } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

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
