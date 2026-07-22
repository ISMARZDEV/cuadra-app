import type { AdminCanonicalProductListDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";
import type { CanonicalProductsParams } from "./lib/canonical-products-params";

export interface CanonicalProductsData {
  list: AdminCanonicalProductListDto;
  params: CanonicalProductsParams;
  locale?: Locale;
}
