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
  baseUnitPriceMinor: number | null | undefined,
  baseMeasure: string | null | undefined,
  displayUnitPriceMinor?: number | null,
  displayUnit?: string | null,
): string {
  // ⭐ EL SERVIDOR MANDA. El dominio resuelve el número y el rótulo en enteros (half-up) con la
  // unidad del envase, y es la MISMA respuesta que reciben la tarjeta y el detalle del móvil.
  //
  // Lo de abajo era una TERCERA forma de contestar lo mismo: dividía por el tamaño parseado y
  // rotulaba con el token crudo, así que un envase de "900 Gr" salía como «RD$0.23/Gr» —por gramo—
  // mientras la tarjeta del móvil decía «RD$22.78 X 100 Gr» y el detalle «RD$227.78 X kg». Tres
  // cifras para un dato. Sobrevive sólo como degradación. Ver `display_units.py`.
  if (displayUnitPriceMinor != null && displayUnit) {
    return `${formatMoney(displayUnitPriceMinor, currency)}/${displayUnit}`;
  }

  const parsed = parseDisplaySize(displaySize);
  if (parsed) {
    return `${formatMoney(Math.round(priceMinor / parsed.amount), currency)}/${parsed.unit}`;
  }
  // Sin cantidad NO hay precio por unidad base: el producto se vende por unidad y no declara peso.
  // Se devuelve vacío en vez de imprimir "RD$0.00/und", que mentiría sobre un dato inexistente.
  if (baseUnitPriceMinor == null || !baseMeasure) return "";
  return formatUnitPrice(baseUnitPriceMinor, currency, baseMeasure);
}
