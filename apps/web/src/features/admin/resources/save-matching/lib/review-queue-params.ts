// Parse/serialize del estado de filtros de la cola de revisión ↔ URLSearchParams. PURA (sin
// React/DOM/vike): el par parse/serialize es lo que hace el estado de la cola COMPARTIBLE por
// link — copiar la URL y pegarla reproduce EXACTAMENTE el mismo filtro/orden/página (batch 2.14).
//
// Espeja el patrón de `apps/web/src/features/save/enums.ts` (parseSort/parseViewMode): nunca
// confiar en el string crudo de la URL — normalizar a un valor válido con default.
import { REVIEW_SORT_COLUMN, type ReviewQueueParams } from "../types";

const DEFAULT_MARKET = "DO"; // single-market F2·B1 (multi-país = F3), pero viaja end-to-end
const DEFAULT_ORDER_BY = "uncertainty"; // default del backend (uncertainty-first), NO fijarlo aquí
const DEFAULT_LIMIT = 10; // página de 10 por default (Figma: "Mostrar [10 ▾] por página")
const DEFAULT_OFFSET = 0;

type Search = Record<string, string | undefined>;

function parseConfidence(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** URL (`?provider_id=&method=&confidence_min=&confidence_max=&order_by=&limit=&offset=&market=`)
 * → estado de filtros tipado con defaults. Inversa de `serializeReviewQueueParams`. */
// `order_by` válido = una columna de `REVIEW_SORT_COLUMN`, opcionalmente con prefijo "-"
// (descendente). Nunca confiar en el string crudo de la URL: si la columna no se reconoce, cae al
// default (`uncertainty`). Espeja el `sortable` del backend (product_match_repository).
function normalizeOrderBy(raw: string | undefined): string {
  if (!raw) return DEFAULT_ORDER_BY;
  const column = raw.startsWith("-") ? raw.slice(1) : raw;
  return (REVIEW_SORT_COLUMN as readonly string[]).includes(column) ? raw : DEFAULT_ORDER_BY;
}

export function parseReviewQueueParams(search: Search): ReviewQueueParams {
  const orderBy = normalizeOrderBy(search.order_by);

  return {
    market: search.market || DEFAULT_MARKET,
    provider_id: search.provider_id || undefined,
    method: search.method || undefined,
    confidence_min: parseConfidence(search.confidence_min),
    confidence_max: parseConfidence(search.confidence_max),
    run_id: search.run_id || undefined,
    order_by: orderBy,
    limit: search.limit ? Number(search.limit) : DEFAULT_LIMIT,
    offset: search.offset ? Number(search.offset) : DEFAULT_OFFSET,
  };
}

/** Inversa de `parseReviewQueueParams`: solo escribe en la URL lo que DIFIERE del default → links
 * limpios (`/admin/review-queue` sin querystring cuando no hay ningún filtro activo). */
export function serializeReviewQueueParams(params: ReviewQueueParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.market && params.market !== DEFAULT_MARKET) qs.set("market", params.market);
  if (params.provider_id) qs.set("provider_id", params.provider_id);
  if (params.method) qs.set("method", params.method);
  if (params.confidence_min !== undefined) {
    qs.set("confidence_min", String(params.confidence_min));
  }
  if (params.confidence_max !== undefined) {
    qs.set("confidence_max", String(params.confidence_max));
  }
  if (params.run_id) qs.set("run_id", params.run_id);
  if (params.order_by && params.order_by !== DEFAULT_ORDER_BY) qs.set("order_by", params.order_by);
  if (params.limit && params.limit !== DEFAULT_LIMIT) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return qs;
}
