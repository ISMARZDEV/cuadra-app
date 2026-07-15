import type { ProviderRefDto } from "@cuadra/api-client";

/** Datos SSR de `pages/admin/providers/+data.ts`: la lista pública de proveedores (id/name/logo_url
 * — no hay endpoint admin de LISTADO todavía, solo alta/edición; ver `api.ts`). */
export interface ProvidersData {
  providers: ProviderRefDto[];
}
