import type { ProviderRefDto, SourceHealthDto } from "@cuadra/api-client";

/** Datos SSR de `pages/admin/sources/+data.ts`: fuentes + salud efectiva (manual-pause +
 * frescura, ver `listSourcesHealth`/3.18-3.19) + los proveedores del mercado (para el select-search
 * del modal). `listSourcesHealth` es admin-gateado (va con token); `listProviders` es público. */
export interface SourcesData {
  sources: SourceHealthDto[];
  providers: ProviderRefDto[];
}
