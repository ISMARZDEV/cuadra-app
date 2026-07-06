import { listBasketQueries } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import type { BasketQueriesData } from "@/features/admin/resources/save-basket/interfaces";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData } from "../+data";

// SSR de la canasta curada: `listBasketQueries` es un endpoint admin gateado
// (`admin_save_ingestion_ops`) — la llamada necesita el token de sesión, MISMO mecanismo que
// `sources/+data.ts` (`extractToken`, nunca un segundo canal de auth). Compone `+data.ts` del padre
// a mano (Vike no acumula `data()` entre niveles) porque `+Layout.tsx` necesita `capabilities`.
export async function data(
  pageContext: PageContextServer,
): Promise<BasketQueriesData & { capabilities: string[] }> {
  const { capabilities } = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);

  const res = await listBasketQueries({
    client: apiClient,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar la canasta curada.");
  }

  return { entries: res.data, capabilities };
}
