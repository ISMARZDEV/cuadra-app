// Diff de campos para la vista comparativa lado a lado (feature #1, F2·B1, P0 — "la palanca #1
// de velocidad y calidad"). PURA (sin React, sin I/O): compara un campo crudo del `store_product`
// contra el mismo campo de un canónico candidato y decide si resaltarlo en verde (coincide) o rojo
// (difiere) — NUNCA lado-a-lado sin resaltar (anti-patrón documentado: más lento y con más errores).
//
// Normaliza con casefold + trim ANTES de comparar: "Rica" vs "rica " debe contar como match, no
// como differ (diferencias de capitalización/espacio en la fuente cruda no son diferencias reales
// de producto).

import { parseSize } from "./parse-size";

export type FieldDiffResult = "match" | "differ";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

// Unidad canónica de 2 letras: las fuentes escriben la misma unidad de mil formas ("Lbs"/"LB"/
// "libras", "gramos"/"g") y compararlas como texto marca "Diferente" tamaños IGUALES. Se colapsan a
// un token único de 2 letras (Lb, Gr, Kg, Oz, Ml, Lt, Cc, Un) para comparar Y mostrar.
const UNIT_CANON: Record<string, string> = {
  lb: "Lb", lbs: "Lb", libra: "Lb", libras: "Lb",
  g: "Gr", gr: "Gr", gramo: "Gr", gramos: "Gr",
  kg: "Kg", kgs: "Kg", kilo: "Kg", kilos: "Kg",
  oz: "Oz", onza: "Oz", onzas: "Oz",
  ml: "Ml",
  l: "Lt", lt: "Lt", lts: "Lt", litro: "Lt", litros: "Lt",
  cc: "Cc",
  un: "Un", und: "Un", unid: "Un", unidad: "Un", unidades: "Un", ud: "Un", uds: "Un",
};

// Tallas por descriptor (sin número) → 1 letra: Grande=G, Mediana=M, Pequeña=P.
const DESCRIPTOR_CANON: Record<string, string> = {
  grande: "G", mediana: "M", mediano: "M", pequena: "P", "pequeña": "P",
  pequeno: "P", "pequeño": "P", chico: "P", chica: "P",
};

/** Unidad → token canónico de 2 letras. Desconocida → el texto crudo trimmeado (no inventa). */
export function canonicalUnit(unit: string | null | undefined): string {
  const key = (unit ?? "").trim().toLowerCase();
  return UNIT_CANON[key] ?? (unit ?? "").trim();
}

/** Tamaño crudo → forma canónica de display: "20 Lbs"→"20 Lb", "Grande"→"G". Desconocido → tal cual. */
export function formatSize(sizeText: string | null | undefined): string {
  const raw = (sizeText ?? "").trim();
  if (!raw) return "—";
  const descriptor = DESCRIPTOR_CANON[raw.toLowerCase()];
  if (descriptor) return descriptor;
  const { amount, unit } = parseSize(sizeText);
  if (!amount) return raw;
  const u = canonicalUnit(unit);
  return u ? `${amount} ${u}` : amount;
}

/**
 * Diff de TAMAÑO: compara cantidad numérica + unidad canónica, NO el texto crudo — así "20 Lbs" y
 * "20 LB" cuentan como `match` (mismo tamaño físico), no como `differ`. Si alguno no tiene cantidad
 * numérica parseable, cae al diff de texto (comportamiento seguro).
 */
export function diffSize(a: string | null | undefined, b: string | null | undefined): FieldDiffResult {
  const pa = parseSize(a);
  const pb = parseSize(b);
  const na = Number.parseFloat((pa.amount ?? "").replace(",", "."));
  const nb = Number.parseFloat((pb.amount ?? "").replace(",", "."));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return diffField(a, b);
  const sameAmount = Math.abs(na - nb) < 1e-9;
  const sameUnit = canonicalUnit(pa.unit) === canonicalUnit(pb.unit);
  return sameAmount && sameUnit ? "match" : "differ";
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
