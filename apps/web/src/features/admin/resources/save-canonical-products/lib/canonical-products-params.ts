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
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

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
    limit: search.limit ? Number(search.limit) : DEFAULT_LIMIT,
    offset: search.offset ? Number(search.offset) : DEFAULT_OFFSET,
  };
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
  if (params.limit !== DEFAULT_LIMIT) qs.set("limit", String(params.limit));
  if (params.offset !== DEFAULT_OFFSET) qs.set("offset", String(params.offset));
  return qs;
}
