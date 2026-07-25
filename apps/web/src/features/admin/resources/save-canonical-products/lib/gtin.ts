/**
 * Forma canónica GTIN-14 de un código de barras (US-CP-D8).
 *
 * La ingesta normaliza a 14 dígitos con zero-padding (R6), pero el panel de Evidencia muestra el
 * dato CRUDO de cada tienda: si una llegara con un EAN-13 sin normalizar, `0781086020518` y
 * `00781086020518` se leerían como códigos DISTINTOS y el operador concluiría que las tiendas no
 * coinciden cuando sí lo hacen. Ese error empuja a crear un duplicado a mano.
 *
 * No inventa dígitos ni valida el check-digit: sólo rellena a la izquierda para poder COMPARAR.
 */
export function toGtin14(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").trim();
  if (!digits) return null;
  // Algo que no son sólo dígitos no es un GTIN: se devuelve tal cual en vez de mutilarlo.
  if (!/^\d+$/.test(digits)) return digits;
  if (digits.length > 14) return digits;
  return digits.padStart(14, "0");
}
