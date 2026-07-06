import {
  createProvider as createProviderRequest,
  setProviderLogo as setProviderLogoRequest,
  updateProvider as updateProviderRequest,
} from "@cuadra/api-client";
import type { ProviderType, SourcePlatform } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Mutaciones client-side de la consola de Providers (3.5) — MISMO mecanismo de auth que
// save-matching/api.ts (`authHeaders()`, token async de Clerk: cuadra-clerk "short-lived-token /
// async token-getter rule"). No hay endpoint admin de LISTADO todavía (solo alta/edición) — la
// pantalla lista vía el público `listProviders` (`+data.ts`) y refresca con un reload tras mutar.
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

// PATCH semántica: solo reenvía `name` — esta consola no expone (todavía) reasignar tipo/
// plataforma/mercado de un proveedor existente porque el público `listProviders` (única fuente de
// la lista) no trae esos campos para prellenar el form sin arriesgar un PATCH-a-ciegas.
export async function updateProvider(params: { providerId: string; name: string }) {
  return updateProviderRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { provider_id: params.providerId },
    body: { name: params.name },
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
