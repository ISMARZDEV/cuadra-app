import { listProviders } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import type { ProvidersData } from "@/features/admin/resources/save-providers/interfaces";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

const MARKET = "DO"; // single-market F2·B1, igual que `pages/save/supermarkets/+data.ts`

// SSR de la lista de proveedores: no hay endpoint admin de LISTADO todavía (solo alta/edición, ver
// `api.ts`), así que se reusa el público `listProviders` (misma llamada que la home de
// Supermercados) — trae id/name/logo_url, suficiente para esta consola (ver `interfaces.ts`).
// Compone `+data.ts` del padre a mano (Vike NO acumula `data()` entre niveles, mismo patrón que
// `review-queue/+data.ts`) porque `+Layout.tsx` necesita `capabilities` para el nav.
export async function data(
  pageContext: PageContextServer,
): Promise<ProvidersData & AdminShellData> {
  const shell = await adminShellData(pageContext);

  const res = await listProviders({ client: apiClient, query: { market: MARKET } });
  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar la lista de proveedores.");
  }

  return { providers: res.data, ...shell };
}
