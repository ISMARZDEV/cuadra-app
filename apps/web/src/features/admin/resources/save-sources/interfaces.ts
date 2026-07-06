import type { SourceHealthDto } from "@cuadra/api-client";

/** Datos SSR de `pages/admin/sources/+data.ts`: fuentes + salud efectiva (manual-pause +
 * frescura, ver `listSourcesHealth`/3.18-3.19). A diferencia de `save-providers` (público, sin
 * endpoint admin de listado), este SÍ es un endpoint admin gateado — la llamada SSR va con token. */
export interface SourcesData {
  sources: SourceHealthDto[];
}
