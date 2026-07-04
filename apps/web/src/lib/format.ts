// Presentación de dinero: minor units (enteros) → string de moneda. Solo PRESENTA, no calcula
// (§12·B: la money-math vive en el backend en enteros; acá solo se muestra).
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency,
  }).format(minor / 100);
}
