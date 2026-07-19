import {
  createProvider as createProviderRequest,
  listAdminProviders as listAdminProvidersRequest,
  setProviderLogo as setProviderLogoRequest,
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

export async function listProvidersEntries(market: string = DEFAULT_MARKET): Promise<ProviderDto[]> {
  const res = await listAdminProvidersRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: { market },
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

export async function setProviderLogo(params: { providerId: string; logoUrl: string | null }) {
  return setProviderLogoRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: params.providerId },
    body: { logo_url: params.logoUrl },
  });
}
