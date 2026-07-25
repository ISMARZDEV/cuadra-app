import type {
  AdminCanonicalAuditEventDto,
  AdminCanonicalDuplicateDto,
  AdminCanonicalEvidenceDto,
  AdminCanonicalProductListDto,
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
} from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";
import type { CanonicalProductsParams } from "./lib/canonical-products-params";

export interface CanonicalProductsData {
  list: AdminCanonicalProductListDto;
  params: CanonicalProductsParams;
  locale?: Locale;
}

/** Datos SSR del detalle (US-CP-D1). El histórico NO viene de acá: su rango es interactivo. */
export interface CanonicalDetailData {
  product: AdminCanonicalProductRowDto;
  providers: AdminCanonicalProviderPriceDto[];
  evidence: AdminCanonicalEvidenceDto[];
  duplicates: AdminCanonicalDuplicateDto[];
  auditLog: AdminCanonicalAuditEventDto[];
  locale?: Locale;
}
