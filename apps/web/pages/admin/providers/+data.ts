import { listAdminProviders } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import type { ProvidersData } from "@/features/admin/resources/save-providers/interfaces";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

const MARKET = "DO"; // single-market F2·B1, igual que `pages/save/supermarkets/+data.ts`

// SSR de la lista de proveedores: usa el endpoint ADMIN gateado `listAdminProviders`
// (`admin_save_ingestion_ops`) con el token de sesión — MISMO mecanismo que `sources/+data.ts`
// (`extractToken`), no un segundo canal de auth. Trae el DTO completo (type/platform/market) para
// edición segura, reemplazando el público `listProviders` (parcial). Compone `+data.ts` del padre a
// mano (Vike NO acumula `data()` entre niveles) porque `+Layout.tsx` necesita `capabilities`.
export async function data(
  pageContext: PageContextServer,
): Promise<ProvidersData & AdminShellData> {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);

  const res = await listAdminProviders({
    client: apiClient,
    query: { market: MARKET },
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar la lista de proveedores.");
  }

  return { providers: res.data, ...shell };
}
