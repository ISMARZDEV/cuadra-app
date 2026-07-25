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
  archiveCanonicalProduct as archiveCanonicalProductRequest,
  commitCanonicalImport as commitCanonicalImportRequest,
  createCanonicalProduct as createCanonicalProductRequest,
  listCanonicalProductDuplicates as listCanonicalProductDuplicatesRequest,
  listCanonicalProductEvidence as listCanonicalProductEvidenceRequest,
  listCanonicalProductProviders as listCanonicalProductProvidersRequest,
  listCanonicalProducts as listCanonicalProductsRequest,
  previewCanonicalImport as previewCanonicalImportRequest,
  unarchiveCanonicalProduct as unarchiveCanonicalProductRequest,
  updateCanonicalProduct as updateCanonicalProductRequest,
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
