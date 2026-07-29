import {
  archiveProvider as archiveProviderRequest,
  createProvider as createProviderRequest,
  listAdminProviders as listAdminProvidersRequest,
  setProviderLogo as setProviderLogoRequest,
  unarchiveProvider as unarchiveProviderRequest,
  updateProvider as updateProviderRequest,
} from "@cuadra/api-client";
import type { ProviderDto, ProviderType, SourcePlatform } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Consola de Providers (3.5 / #11) — MISMO mecanismo de auth que save-matching/api.ts
// (`authHeaders()`, token async de Clerk: cuadra-clerk "async token-getter rule"). El listado usa el
// endpoint ADMIN gateado `listAdminProviders` (DTO completo type/platform/market), NO el público
// `listProviders` — la consola dejó de depender del contrato parcial (plan §5.1). Refresca
// client-side tras mutar (reemplaza `window.location.reload()`).
const DEFAULT_MARKET = "DO";

export async function listProvidersEntries(
  market: string = DEFAULT_MARKET,
  options: { includeArchived?: boolean } = {},
): Promise<ProviderDto[]> {
  const res = await listAdminProvidersRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: { market, include_archived: options.includeArchived ?? false },
  });
  return res.data ?? [];
}

export async function createProvider(params: {
  name: string;
  type: ProviderType;
  platform: SourcePlatform;
  marketId: string;
  logoUrl?: string | null;
}) {
  return createProviderRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      name: params.name,
      type: params.type,
      platform: params.platform,
      market_id: params.marketId,
      logo_url: params.logoUrl ?? null,
    },
  });
}

// PATCH: con el DTO admin la consola ya puede prellenar y reasignar type/platform/market con
// seguridad (antes solo `name`, porque el público no traía esos campos). Solo se envían los campos
// presentes (PATCH parcial).
export async function updateProvider(params: {
  providerId: string;
  name?: string;
  type?: ProviderType;
  platform?: SourcePlatform;
  marketId?: string;
}) {
  return updateProviderRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: params.providerId },
    body: {
      name: params.name,
      type: params.type,
      platform: params.platform,
      market_id: params.marketId,
    },
  });
}

// Archivar es SOFT-delete: `provider_id` está referenciado por FK desde `store_registry`,
// `store_product` y `orchestration_policy` (esta última en CASCADE), así que borrar de verdad se
// llevaría el histórico de precios de la cadena. `unarchive` es la inversa exacta — por eso la
// consola puede ofrecer archivar sin que sea un camino de ida.
export async function archiveProvider(providerId: string) {
  return archiveProviderRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: providerId },
  });
}

export async function unarchiveProvider(providerId: string) {
  return unarchiveProviderRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: providerId },
  });
}

export async function setProviderLogo(params: { providerId: string; logoUrl: string | null }) {
  return setProviderLogoRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: params.providerId },
    body: { logo_url: params.logoUrl },
  });
}
