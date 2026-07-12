import type { SourcePlatform } from "@cuadra/api-client";

// Opciones del <Select> de alta (3.11): array local sobre el tipo generado — el backend
// (`SourcePlatform`, StrEnum) es la fuente de verdad de los VALORES; esto solo los enumera para
// poder iterarlos en la UI (no hay endpoint de "opciones válidas"), mismo patrón que
// `save-providers/types.ts`.
export const SOURCE_PLATFORM_OPTIONS: readonly SourcePlatform[] = [
  "vtex",
  "magento",
  "shopify",
  "rest_catalog",
  "aggregator",
  "spa",
];

// Etiqueta profesional por plataforma (en vez del valor crudo del enum en minúsculas). Fuente de
// verdad del VALOR sigue siendo el backend (`SourcePlatform`); esto solo lo presenta bonito en la UI.
export const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  vtex: "VTEX",
  magento: "Magento",
  shopify: "Shopify",
  rest_catalog: "REST Catalog",
  aggregator: "Agregador",
  spa: "SPA (scraping)",
};

export function platformLabel(platform: SourcePlatform): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

// §15.2 — tipos de auth soportados (modelo tipado, patrón Postman). El valor vive en
// `store_registry.auth`; en la UI el select decide qué campos mostrar. `mask_auth` (backend) devuelve
// el secreto enmascarado en la lectura → en edición se muestra `••••…` y solo se reescribe si cambia.
export type SourceAuthType = "none" | "bearer" | "api_key" | "basic";
export const SOURCE_AUTH_TYPES: readonly SourceAuthType[] = ["none", "bearer", "api_key", "basic"];
