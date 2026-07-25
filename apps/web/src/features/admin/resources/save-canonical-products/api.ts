import {
  type AdminCanonicalDuplicateDto,
  type AdminCanonicalEvidenceDto,
  type AdminCanonicalProductListDto,
  type AdminCanonicalProductRowDto,
  type AdminCanonicalProviderPriceDto,
  type CreateCanonicalProductRequest,
  type ImportCommitDto,
  type ImportPreviewDto,
  type ImportRequest,
  type UpdateCanonicalProductRequest,
  type AdminCanonicalAuditEventDto,
  type BulkCategoryAdviceDto,
  type BulkSetCategoryResultDto,
  type CategorySuggestionDto,
  type SlugPreviewDto,
  type AdminCanonicalPriceHistoryDto,
  archiveCanonicalProduct as archiveCanonicalProductRequest,
  bulkSetCanonicalCategory as bulkSetCanonicalCategoryRequest,
  commitCanonicalImport as commitCanonicalImportRequest,
  createCanonicalProduct as createCanonicalProductRequest,
  listCanonicalProductDuplicates as listCanonicalProductDuplicatesRequest,
  listCanonicalProductEvidence as listCanonicalProductEvidenceRequest,
  listCanonicalProductProviders as listCanonicalProductProvidersRequest,
  getCanonicalProductHistory as getCanonicalProductHistoryRequest,
  listCanonicalProductAuditLog as listCanonicalProductAuditLogRequest,
  listCanonicalProducts as listCanonicalProductsRequest,
  previewCanonicalImport as previewCanonicalImportRequest,
  previewCanonicalSlug as previewCanonicalSlugRequest,
  regenerateCanonicalSlug as regenerateCanonicalSlugRequest,
  setCanonicalCategory as setCanonicalCategoryRequest,
  suggestBulkCategories as suggestBulkCategoriesRequest,
  suggestCanonicalCategories as suggestCanonicalCategoriesRequest,
  unarchiveCanonicalProduct as unarchiveCanonicalProductRequest,
  updateCanonicalProduct as updateCanonicalProductRequest,
  updateInternalNote as updateInternalNoteRequest,
} from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Wrappers finos sobre el cliente generado (contract-first): la pantalla NUNCA arma URLs ni
// headers a mano. `authHeaders()` es async porque el token de Clerk es de vida corta y hay que
// pedirlo en cada llamada, no cachearlo.

export interface ListCanonicalProductsQuery {
  search?: string | null;
  brand_id?: string | null;
  taxonomy_node_id?: string | null;
  quality_status?: string | null;
  ean_reachable?: boolean | null;
  min_provider_count?: number | null;
  updated_since?: string | null;
  include_archived?: boolean | null;
  sort?: string | null;
  limit?: number;
  offset?: number;
}

export async function listCanonicalProducts(
  query?: ListCanonicalProductsQuery,
): Promise<AdminCanonicalProductListDto | null> {
  const res = await listCanonicalProductsRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: query as never,
  });
  return res.data ?? null;
}

export async function listCanonicalProductProviders(
  canonicalProductId: string,
): Promise<AdminCanonicalProviderPriceDto[] | null> {
  const res = await listCanonicalProductProvidersRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

export async function listCanonicalProductEvidence(
  canonicalProductId: string,
): Promise<AdminCanonicalEvidenceDto[] | null> {
  const res = await listCanonicalProductEvidenceRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

export async function listCanonicalProductDuplicates(
  canonicalProductId: string,
): Promise<AdminCanonicalDuplicateDto[] | null> {
  const res = await listCanonicalProductDuplicatesRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

export async function createCanonicalProduct(
  payload: CreateCanonicalProductRequest,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await createCanonicalProductRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: payload,
  });
  return res.data ?? null;
}

export async function updateCanonicalProduct(
  canonicalProductId: string,
  payload: UpdateCanonicalProductRequest,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await updateCanonicalProductRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
    body: payload,
  });
  return res.data ?? null;
}

/** Paso 2 del import: valida SIN persistir. Lo que devuelve es lo que VA a pasar, no lo que pasó. */
export async function previewCanonicalImport(
  payload: ImportRequest,
): Promise<ImportPreviewDto | null> {
  const res = await previewCanonicalImportRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: payload,
  });
  return res.data ?? null;
}

/** Paso 3 del import: persiste. Cada fila creada queda auditada con `origin=bulk_import`. */
export async function commitCanonicalImport(
  payload: ImportRequest,
): Promise<ImportCommitDto | null> {
  const res = await commitCanonicalImportRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: payload,
  });
  return res.data ?? null;
}

/** Archiva (soft-delete): lo saca del sitio público SIN borrar nada. Reversible con `unarchive`. */
export async function archiveCanonicalProduct(
  canonicalProductId: string,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await archiveCanonicalProductRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

export async function unarchiveCanonicalProduct(
  canonicalProductId: string,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await unarchiveCanonicalProductRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

/** Histórico + KPIs del rango. `providerIds` vacío = todas las tiendas (US-CP-D6/D7). */
export async function getCanonicalProductHistory(
  canonicalProductId: string,
  range: string,
  providerIds?: string[],
): Promise<AdminCanonicalPriceHistoryDto | null> {
  const res = await getCanonicalProductHistoryRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
    query: { range, provider_ids: providerIds?.length ? providerIds : undefined } as never,
  });
  return res.data ?? null;
}

export async function listCanonicalProductAuditLog(
  canonicalProductId: string,
): Promise<AdminCanonicalAuditEventDto[] | null> {
  const res = await listCanonicalProductAuditLogRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

/** Nota interna (US-CP-D10). Nunca sale por un DTO público. */
export async function updateInternalNote(
  canonicalProductId: string,
  note: string | null,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await updateInternalNoteRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
    body: { internal_note: note },
  });
  return res.data ?? null;
}

/** Qué slug tendría el canónico si se regenerara. No persiste nada (US-CP-D2b). */
export async function previewCanonicalSlug(
  canonicalProductId: string,
): Promise<SlugPreviewDto | null> {
  const res = await previewCanonicalSlugRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

/** Acción EXPLÍCITA: editar el nombre nunca regenera el slug por su cuenta. */
export async function regenerateCanonicalSlug(
  canonicalProductId: string,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await regenerateCanonicalSlugRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

/** Sugerencias deterministas del léxico (US-CP-D2c). Vacío = sin señal, usar el árbol. */
export async function suggestCanonicalCategories(
  canonicalProductId: string,
): Promise<CategorySuggestionDto[] | null> {
  const res = await suggestCanonicalCategoriesRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
  });
  return res.data ?? null;
}

/** Asigna la categoría. Queda registrada como decisión HUMANA, no del clasificador. */
export async function setCanonicalCategory(
  canonicalProductId: string,
  taxonomyNodeId: string,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await setCanonicalCategoryRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { canonical_product_id: canonicalProductId },
    body: { taxonomy_node_id: taxonomyNodeId },
  });
  return res.data ?? null;
}

/** Sugerencias calculadas sobre el CONJUNTO seleccionado, con la advertencia de heterogeneidad
 * (US-CP-L10). No persiste nada. */
export async function suggestBulkCategories(
  canonicalProductIds: string[],
): Promise<BulkCategoryAdviceDto | null> {
  const res = await suggestBulkCategoriesRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: { canonical_product_ids: canonicalProductIds },
  });
  return res.data ?? null;
}

/** Asigna la categoría a N canónicos. Cada uno se registra como decisión HUMANA por separado. */
export async function bulkSetCanonicalCategory(
  canonicalProductIds: string[],
  taxonomyNodeId: string,
): Promise<BulkSetCategoryResultDto | null> {
  const res = await bulkSetCanonicalCategoryRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      canonical_product_ids: canonicalProductIds,
      taxonomy_node_id: taxonomyNodeId,
    },
  });
  return res.data ?? null;
}
