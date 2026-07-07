import { listReviewQueue } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { parseReviewQueueParams } from "@/features/admin/resources/save-matching/lib/review-queue-params";
import type { ReviewQueueData } from "@/features/admin/resources/save-matching/types";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData } from "../+data";

// SSR de la cola de revisión: los filtros/orden/paginación viven en la URL (`?provider_id=&
// method=&confidence_min=&confidence_max=&order_by=&limit=&offset=`, ver `review-queue-params.ts`,
// batch 2.14/2.15) → estado shareable-por-link, el server SIEMPRE resuelve con el filtro vigente
// (nunca solo client-side). `+guard.ts` (batch 2.1-2.6) ya bloqueó el acceso sin la capability
// ANTES de llegar acá; esta llamada igual necesita el token para que el backend la autentique
// (`require_capability` en `admin_save.py`) — se extrae con el MISMO mecanismo que
// `require-admin.ts` (NUNCA un segundo canal de auth).
//
// Compone la data del `+data.ts` padre (`pages/admin/+data.ts`, batch 2e): Vike no acumula hooks
// `data()` automáticamente, así que esta página SIEMPRE debe fusionar `capabilities` a mano —
// `+Layout.tsx` la necesita para el nav de `AdminLayout`.
export async function data(
  pageContext: PageContextServer,
): Promise<ReviewQueueData & { capabilities: string[] }> {
  const { capabilities } = await adminShellData(pageContext);
  const params = parseReviewQueueParams(pageContext.urlParsed.search);
  const token = extractToken(pageContext.headers);

  const res = await listReviewQueue({
    client: apiClient,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    query: {
      market: params.market,
      provider_id: params.provider_id,
      method: params.method,
      confidence_min: params.confidence_min,
      confidence_max: params.confidence_max,
      order_by: params.order_by,
      limit: params.limit,
      offset: params.offset,
    },
  });

  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar la cola de revisión.");
  }

  return { rows: res.data.rows, total: res.data.total, params, capabilities };
}
