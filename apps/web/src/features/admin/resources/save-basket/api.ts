import {
  createBasketQuery as createBasketQueryRequest,
  listBasketQueries as listBasketQueriesRequest,
  previewBasketQuery as previewBasketQueryRequest,
  removeBasketQuery as removeBasketQueryRequest,
  updateBasketQuery as updateBasketQueryRequest,
} from "@cuadra/api-client";
import type { BasketPreviewGroupDto, BasketQueryDto } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Mutaciones client-side del editor de Canasta curada (3.16): MISMO mecanismo de auth que
// `save-providers/api.ts` y `save-sources/api.ts` (`authHeaders()`, token async de Clerk).
export async function listBasketQueryEntries(market?: string): Promise<BasketQueryDto[] | null> {
  const res = await listBasketQueriesRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: market ? { market } : undefined,
  });
// `null` = falló la petición, y NO `[]`: colapsar el error a lista vacía deja la tabla en
// "0 resultados", indistinguible de que de verdad no haya nada. `useAdminList` conserva lo
// que ya se mostraba y la pantalla avisa.
  return res.data ?? null;
}

// Resultado discriminado del alta (SAGRADO, mismo patrón que `probeSource` en
// `save-sources/api.ts`: nunca colapsar a `null`) — el backend responde 409 cuando la query
// duplica `(market_id, query_text)` (batch 3D), causa y remedio distintos de un 422 genérico.
export type CreateBasketQueryResult =
  | { ok: true; entry: BasketQueryDto }
  | { ok: false; kind: "duplicate"; message: string }
  | { ok: false; kind: "invalid"; message: string };

export async function createBasketQueryEntry(params: {
  marketId: string;
  queryText: string;
  categoryLabel?: string | null;
  position?: number;
  active?: boolean;
}): Promise<CreateBasketQueryResult> {
  const res = await createBasketQueryRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      market_id: params.marketId,
      query_text: params.queryText,
      category_label: params.categoryLabel ?? null,
      position: params.position,
      active: params.active,
    },
  });

  if (!res.error) {
    return { ok: true, entry: res.data as BasketQueryDto };
  }

  if (res.response?.status === 409) {
    return {
      ok: false,
      kind: "duplicate",
      message: "esa query ya existe en la canasta.",
    };
  }
  return {
    ok: false,
    kind: "invalid",
    message: "no se pudo crear la query — revisá los datos.",
  };
}

export async function updateBasketQueryEntry(
  id: string,
  patch: {
    categoryLabel?: string | null;
    queryText?: string | null;
    position?: number | null;
    active?: boolean | null;
  },
) {
  return updateBasketQueryRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { query_id: id },
    body: {
      category_label: patch.categoryLabel,
      query_text: patch.queryText,
      position: patch.position,
      active: patch.active,
    },
  });
}

// Preview dry-run (F2, canasta consultable): qué devolvería un término en cada tienda del mercado,
// SIN persistir (backend SSRF-guarded). Nunca colapsa a null — devuelve [] si el request falla, para
// que la UI muestre "sin resultados" en vez de romperse.
export async function previewBasketQueryTerm(
  queryText: string,
  market: string = "DO",
): Promise<BasketPreviewGroupDto[] | null> {
  const res = await previewBasketQueryRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: { query_text: queryText, market_id: market },
  });
  // `null` = falló el dry-run. Devolver `[]` hacía que un 500 del servidor se leyera como "ninguna
  // tienda devuelve nada para este término", que es justo la conclusión contraria a la verdadera.
  return res.data ?? null;
}

export async function removeBasketQueryEntry(id: string) {
  return removeBasketQueryRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { query_id: id },
  });
}
