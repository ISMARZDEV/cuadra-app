import type { AdminCanonicalProductListDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";

export interface CanonicalProductsData {
  list: AdminCanonicalProductListDto;
  locale?: Locale;
}
