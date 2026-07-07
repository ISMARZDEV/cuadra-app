// Diff de campos para la vista comparativa lado a lado (feature #1, F2·B1, P0 — "la palanca #1
// de velocidad y calidad"). PURA (sin React, sin I/O): compara un campo crudo del `store_product`
// contra el mismo campo de un canónico candidato y decide si resaltarlo en verde (coincide) o rojo
// (difiere) — NUNCA lado-a-lado sin resaltar (anti-patrón documentado: más lento y con más errores).
//
// Normaliza con casefold + trim ANTES de comparar: "Rica" vs "rica " debe contar como match, no
// como differ (diferencias de capitalización/espacio en la fuente cruda no son diferencias reales
// de producto).

export type FieldDiffResult = "match" | "differ";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Compara dos valores de un mismo campo (ej. `name`, `brand`) entre el `store_product` crudo y un
 * canónico candidato. `null`/`undefined`/string vacío se tratan todos como "ausente" — dos campos
 * ausentes cuentan como `match` (nada que resaltar en rojo), pero un valor real contra un campo
 * ausente cuenta como `differ` (señal real de que falta información).
 */
export function diffField(a: string | null | undefined, b: string | null | undefined): FieldDiffResult {
  return normalize(a) === normalize(b) ? "match" : "differ";
}
