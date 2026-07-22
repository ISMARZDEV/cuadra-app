import type {
  AdminCanonicalProductListDto,
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
  CreateCanonicalProductRequest,
} from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

import {
  getCanonicalProductBySlug as getCanonicalProductBySlugRequest,
  listCanonicalProducts as listCanonicalProductsRequest,
  listCanonicalProductProviders as listCanonicalProductProvidersRequest,
  createCanonicalProduct as createCanonicalProductRequest,
} from "@cuadra/api-client";

export async function listCanonicalProducts(params?: {
  search?: string | null;
  brand_id?: string | null;
  taxonomy_node_id?: string | null;
  quality_status?: string | null;
  ean_reachable?: boolean | null;
  limit?: number;
  offset?: number;
}): Promise<AdminCanonicalProductListDto | null> {
  const res = await listCanonicalProductsRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: params,
  });
  return res.data ?? null;
}

export async function getCanonicalProductBySlug(
  slug: string,
): Promise<AdminCanonicalProductRowDto | null> {
  const res = await getCanonicalProductBySlugRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { slug },
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
