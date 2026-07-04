// Presentación de dinero: minor units (enteros) → string de moneda. Solo PRESENTA, no calcula
// (§12·B: la money-math vive en el backend en enteros; acá solo se muestra).
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

// Etiqueta de la unidad base del precio/unidad (mass→kg, volume→L, count→und). El backend ya
// normalizó a la unidad base; acá solo se muestra el símbolo.
const UNIT_LABEL: Record<string, string> = { mass: "kg", volume: "L", count: "und" };
export function unitLabel(measure: string): string {
  return UNIT_LABEL[measure] ?? measure;
}

// "RD$42.40/kg" — precio por unidad base para las cards (§B2).
export function formatUnitPrice(minor: number, currency: string, measure: string): string {
  return `${formatMoney(minor, currency)}/${unitLabel(measure)}`;
}
