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

// Parsea "10 LB" / "500 GR" / "1.5 LT" → { amount, unit }. Para el precio por unidad ORIGINAL
// (como la referencia: "por LB"), en vez del normalizado a unidad base (kg/L).
export function parseDisplaySize(
  displaySize: string | null | undefined,
): { amount: number; unit: string } | null {
  if (!displaySize) return null;
  const m = displaySize.trim().match(/^([\d.,]+)\s*(.+)$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit: m[2].trim() };
}

// "RD$42.40/LB" usando el tamaño ORIGINAL del empaque; si no hay display_size, cae al precio por
// unidad base (kg/L/und).
export function formatUnitPriceDisplay(
  priceMinor: number,
  currency: string,
  displaySize: string | null | undefined,
  baseUnitPriceMinor: number,
  baseMeasure: string,
): string {
  const parsed = parseDisplaySize(displaySize);
  if (parsed) {
    return `${formatMoney(Math.round(priceMinor / parsed.amount), currency)}/${parsed.unit}`;
  }
  return formatUnitPrice(baseUnitPriceMinor, currency, baseMeasure);
}
