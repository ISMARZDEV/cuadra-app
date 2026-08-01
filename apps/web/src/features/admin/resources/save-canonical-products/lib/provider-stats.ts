import type { AdminCanonicalProviderPriceDto } from "@cuadra/api-client";

/**
 * Estadística de la zona de proveedores del detalle.
 *
 * Los cuatro tiles y las etiquetas de cada fila salen del MISMO cálculo. En el mockup no era así
 * y se notaba: el tile "Precio más alto" decía RD$76.00, la fila más cara RD$75.00 y la
 * "Diferencia" RD$1.00 — tres números que no cerraban entre sí. Derivarlos de un solo lugar hace
 * que esa clase de contradicción no pueda volver a existir.
 */
export interface ProviderStats {
  minMinor: number;
  maxMinor: number;
  /** Máximo menos mínimo. Es lo que el comprador se ahorra eligiendo bien. */
  spreadMinor: number;
  activeCount: number;
  currency: string;
}

export function providerStats(
  providers: AdminCanonicalProviderPriceDto[],
): ProviderStats | null {
  if (providers.length === 0) return null;
  const prices = providers.map((p) => p.price_minor);
  const minMinor = Math.min(...prices);
  const maxMinor = Math.max(...prices);
  return {
    minMinor,
    maxMinor,
    spreadMinor: maxMinor - minMinor,
    activeCount: providers.length,
    currency: providers[0].currency,
  };
}

export interface RowStanding {
  kind: "cheapest" | "priciest" | "middle";
  /** Cuánto más cara es esta tienda que la más barata. Cero en la más barata. */
  deltaMinor: number;
}

/**
 * Dónde queda una tienda dentro del abanico.
 *
 * `cheapest` gana sobre `priciest` a propósito: si todas las tiendas empatan, el mínimo y el
 * máximo son el mismo número y marcar a alguna como "la más cara" sería un desempate inventado.
 */
export function rowStanding(
  row: AdminCanonicalProviderPriceDto,
  stats: ProviderStats,
): RowStanding {
  const deltaMinor = row.price_minor - stats.minMinor;
  if (row.price_minor === stats.minMinor) return { kind: "cheapest", deltaMinor };
  if (row.price_minor === stats.maxMinor) return { kind: "priciest", deltaMinor };
  return { kind: "middle", deltaMinor };
}
