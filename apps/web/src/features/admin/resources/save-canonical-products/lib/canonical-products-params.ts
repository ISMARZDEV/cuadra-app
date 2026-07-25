// Parse/serialize del estado de filtros de Productos Canónicos ↔ URLSearchParams. PURA (sin
// React/DOM/vike): el par parse/serialize es lo que hace el estado COMPARTIBLE por link — copiar
// la URL y pegarla reproduce EXACTAMENTE el mismo filtro/página.
//
// Espeja el patrón de `review-queue-params.ts`: nunca confiar en el string crudo de la URL —
// normalizar a un valor válido con default.

export interface CanonicalProductsParams {
  search?: string;
  brand_id?: string;
  taxonomy_node_id?: string;
  quality_status?: string;
  ean_reachable?: boolean;
  /** Cobertura mínima: sólo canónicos con al menos N tiendas enlazadas (US-CP-L2). */
  min_provider_count?: number;
  /** ISO date: sólo canónicos cuyo precio se vio desde esa fecha (US-CP-L2). */
  updated_since?: string;
  /** `name|providers|completeness|updated`, con prefijo `-` para descendente (US-CP-L9). */
  sort?: string;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const DEFAULT_SORT = "name";

type Search = Record<string, string | undefined>;

function parseBoolean(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/** URL (`?search=&brand_id=&taxonomy_node_id=&quality_status=&ean_reachable=&limit=&offset=`)
 * → estado de filtros tipado con defaults. Inversa de `serializeCanonicalProductsParams`. */
export function parseCanonicalProductsParams(search: Search): CanonicalProductsParams {
  return {
    search: search.search || undefined,
    brand_id: search.brand_id || undefined,
    taxonomy_node_id: search.taxonomy_node_id || undefined,
    quality_status: search.quality_status || undefined,
    ean_reachable: parseBoolean(search.ean_reachable),
    min_provider_count: parsePositiveInt(search.min_provider_count),
    updated_since: search.updated_since || undefined,
    sort: search.sort || undefined,
    limit: parsePositiveInt(search.limit) ?? DEFAULT_LIMIT,
    offset: parsePositiveInt(search.offset) ?? DEFAULT_OFFSET,
  };
}

/** `undefined` ante basura: un `?limit=abc` pegado a mano no puede reventar el SSR con `NaN`. */
function parsePositiveInt(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/** Inversa de `parseCanonicalProductsParams`: solo escribe en la URL lo que DIFIERE del default →
 * links limpios (`/admin/canonical-products` sin querystring cuando no hay ningún filtro activo). */
export function serializeCanonicalProductsParams(
  params: CanonicalProductsParams,
): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.brand_id) qs.set("brand_id", params.brand_id);
  if (params.taxonomy_node_id) qs.set("taxonomy_node_id", params.taxonomy_node_id);
  if (params.quality_status) qs.set("quality_status", params.quality_status);
  if (params.ean_reachable !== undefined) qs.set("ean_reachable", String(params.ean_reachable));
  if (params.min_provider_count !== undefined)
    qs.set("min_provider_count", String(params.min_provider_count));
  if (params.updated_since) qs.set("updated_since", params.updated_since);
  if (params.sort && params.sort !== DEFAULT_SORT) qs.set("sort", params.sort);
  if (params.limit !== DEFAULT_LIMIT) qs.set("limit", String(params.limit));
  if (params.offset !== DEFAULT_OFFSET) qs.set("offset", String(params.offset));
  return qs;
}

/** Cuántos filtros (sin contar búsqueda/orden/paginación) están activos — para el badge del botón. */
export function countActiveFilters(params: CanonicalProductsParams): number {
  return [
    params.brand_id,
    params.taxonomy_node_id,
    params.quality_status,
    params.ean_reachable,
    params.min_provider_count,
    params.updated_since,
  ].filter((v) => v !== undefined && v !== "").length;
}
