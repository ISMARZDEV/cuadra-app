import type { AdminReviewQueueRowDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";

// Valores de WIRE de la cola de revisión (params de URL) → union string-literal `as const`, misma
// regla de tipos que `apps/web/src/features/save/enums.ts` (enum = dominio cerrado; `as const` =
// lo que viaja por la red/URL). `method` refleja los métodos reales de la cascada de matching
// (fuente de verdad: cuadra-save-matching — ean|trgm|vector|hybrid|llm|human); no se valida
// estrictamente contra esta lista en `review-queue-params.ts` (el backend es quien filtra), pero
// alimenta el <Select> del filtro en la UI.
export const REVIEW_METHOD = ["ean", "trgm", "vector", "hybrid", "llm", "human"] as const;
export type ReviewMethod = (typeof REVIEW_METHOD)[number];

export const REVIEW_ORDER_BY = ["uncertainty", "created_at"] as const;
export type ReviewOrderBy = (typeof REVIEW_ORDER_BY)[number];

/** Estado de filtros/orden/paginación de la cola de revisión — vive en la URL (shareable link,
 * batch 2.14/2.15). `market` no tiene selector en esta UI todavía (single-market DO, F2·B1) pero
 * viaja end-to-end para no bloquear F3 (multi-país). */
export interface ReviewQueueParams {
  market: string;
  provider_id?: string;
  method?: string;
  confidence_min?: number;
  confidence_max?: number;
  order_by: string;
  limit: number;
  offset: number;
}

/** Datos SSR de `pages/admin/review-queue/+data.ts`: la página actual + los params que la
 * produjeron (para que la UI refleje el estado de filtro vigente sin re-derivarlo de la URL). */
export interface ReviewQueueData {
  rows: AdminReviewQueueRowDto[];
  total: number;
  params: ReviewQueueParams;
  /** Locale del admin (Batch 6, `AdminShellData.locale` fusionado en `+data.ts`) — el screen lo usa
   * para `CategoryBadge`/`MethodBadge`/`formatMatchDate`/`useAdminI18n`. Opcional para no romper
   * los mocks de test existentes que aún no lo setean (cae a `DEFAULT_LOCALE`). */
  locale?: Locale;
}
