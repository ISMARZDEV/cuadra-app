import type { ProviderType, SourcePlatform } from "@cuadra/api-client";

// Opciones de los <Select> de alta (3.5): arrays locales sobre los tipos generados — el backend
// (`ProviderType`/`SourcePlatform`, enums StrEnum) es la fuente de verdad de los VALORES; esto solo
// los enumera para poder iterarlos en la UI (no hay endpoint de "opciones válidas").
export const PROVIDER_TYPE_OPTIONS: readonly ProviderType[] = ["supermarket", "bank", "insurer"];
export const SOURCE_PLATFORM_OPTIONS: readonly SourcePlatform[] = [
  "vtex",
  "magento",
  "shopify",
  "aggregator",
  "spa",
];
