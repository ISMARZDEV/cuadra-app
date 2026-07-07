import type { SourcePlatform } from "@cuadra/api-client";

// Opciones del <Select> de alta (3.11): array local sobre el tipo generado — el backend
// (`SourcePlatform`, StrEnum) es la fuente de verdad de los VALORES; esto solo los enumera para
// poder iterarlos en la UI (no hay endpoint de "opciones válidas"), mismo patrón que
// `save-providers/types.ts`.
export const SOURCE_PLATFORM_OPTIONS: readonly SourcePlatform[] = [
  "vtex",
  "magento",
  "shopify",
  "aggregator",
  "spa",
];
