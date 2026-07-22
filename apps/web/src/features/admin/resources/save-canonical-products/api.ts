import type { AdminCanonicalProductListDto, AdminCanonicalProductRowDto } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

import {
  getCanonicalProductBySlug as getCanonicalProductBySlugRequest,
  listCanonicalProducts as listCanonicalProductsRequest,
} from "@cuadra/api-client";

export async function listCanonicalProducts(params?: {
  search?: string | null;
  brand_id?: string | null;
  taxonomy_node_id?: string | null;
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
