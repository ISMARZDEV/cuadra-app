import { listProviders, listSourcesHealth } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import type { SourcesData } from "@/features/admin/resources/save-sources/interfaces";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

// SSR de la lista de fuentes: a diferencia de `providers/+data.ts` (público, `listProviders`),
// `listSourcesHealth` SÍ es un endpoint admin gateado (`admin_save_ingestion_ops`) — la llamada
// necesita el token de sesión, MISMO mecanismo que `review-queue/+data.ts` (`extractToken`, nunca
// un segundo canal de auth). Compone `+data.ts` del padre a mano (Vike no acumula `data()` entre
// niveles) porque `+Layout.tsx` necesita `capabilities` para el nav.
export async function data(
  pageContext: PageContextServer,
): Promise<SourcesData & AdminShellData> {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);

  const res = await listSourcesHealth({
    client: apiClient,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar la lista de fuentes.");
  }

  // Proveedores del mercado para el select-search del modal (público, `listProviders`, sin auth) —
  // el admin elige un proveedor disponible por país en vez de pegar un uuid.
  const providersRes = await listProviders({ client: apiClient, query: { market: "DO" } });

  return { sources: res.data, providers: providersRes.data ?? [], ...shell };
}
