import type {
  AdminCanonicalAuditEventDto,
  AdminCanonicalDuplicateDto,
  AdminCanonicalEvidenceDto,
  AdminCanonicalProductListDto,
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
  CanonicalImageDto,
  CategorySuggestionDto,
  TaxonomyLeafDto,
} from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";
import type { CanonicalProductsParams } from "./lib/canonical-products-params";

export interface CanonicalProductsData {
  list: AdminCanonicalProductListDto;
  params: CanonicalProductsParams;
  /** Hojas de taxonomía para el picker de la asignación en lote (US-CP-L10). */
  taxonomyLeaves?: TaxonomyLeafDto[];
  locale?: Locale;
}

/** Datos SSR del detalle (US-CP-D1). El histórico NO viene de acá: su rango es interactivo. */
export interface CanonicalDetailData {
  product: AdminCanonicalProductRowDto;
  providers: AdminCanonicalProviderPriceDto[];
  evidence: AdminCanonicalEvidenceDto[];
  duplicates: AdminCanonicalDuplicateDto[];
  auditLog: AdminCanonicalAuditEventDto[];
  taxonomyLeaves: TaxonomyLeafDto[];
  categorySuggestions: CategorySuggestionDto[];
  /** Galería ordenada; posición 1 = imagen pública. */
  images: CanonicalImageDto[];
  /** Filtros/paginación/orden que trajo el operador desde la lista. */
  params: CanonicalProductsParams;
  /** Posición del producto dentro del listado filtrado + prev/next para el pager. */
  cursor: {
    total: number;
    position: number | null;
    previous_id: string | null;
    next_id: string | null;
  };
  locale?: Locale;
}
