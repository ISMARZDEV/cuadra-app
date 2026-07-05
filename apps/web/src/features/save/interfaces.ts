// Props de los componentes del feature Save (shapes de objeto). Los componentes importan sus props
// desde acá (regla de tipos, paridad con mobile). PURO (Layer 1).
import type { ProductCardDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";

export interface ProductRailProps {
  products: ProductCardDto[];
  locale: Locale;
  /** Construye el href del producto a partir de su slug (SEO). */
  productHref: (slug: string) => string;
}
