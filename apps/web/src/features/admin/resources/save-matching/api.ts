import { createCanonicalAndLink, resolveReview } from "@cuadra/api-client";

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
