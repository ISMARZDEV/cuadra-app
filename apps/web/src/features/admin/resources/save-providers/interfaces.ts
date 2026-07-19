import type { ProviderDto } from "@cuadra/api-client";

/** Datos SSR de `pages/admin/providers/+data.ts`: la lista ADMIN de proveedores con el DTO completo
 * (type/platform/market_id/logo_url) vía `GET /admin/save/providers` (T1/#11) — reemplaza el consumo
 * del endpoint público `listProviders` (parcial). Habilita edición segura de tipo/plataforma. */
export interface ProvidersData {
  providers: ProviderDto[];
}
