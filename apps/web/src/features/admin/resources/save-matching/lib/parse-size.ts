// Parse de `store_product_size_text` (un string libre de ingesta, ej. "24 Oz", "2.0 Kg",
// "115.2 Gr", "1 Lb") en las dos columnas del Figma "Tamaño" (número) + "Tipo Peso" (unidad).
// PURA (sin React/DOM) — mismo espíritu que `confidence-color.ts`/`review-queue-params.ts`: nunca
// confiar en el string crudo, normalizar con un default gracioso. No hay parser de unidades en el
// backend (el dominio guarda `size_text` como un string único, ver SPEC Fase 3) — este es
// deliberadamente un split de PRESENTACIÓN, no una normalización de unidades (eso sería un cambio
// de dominio aparte).
export interface ParsedSize {
  amount: string | null;
  unit: string | null;
}

// número (con decimal opcional) + espacio opcional + unidad alfabética.
const SIZE_PATTERN = /^([\d.,]+)\s*([A-Za-zÀ-ÿ]+)$/;

export function parseSize(sizeText: string | null | undefined): ParsedSize {
  const trimmed = sizeText?.trim();
  if (!trimmed) return { amount: null, unit: null };

  const match = SIZE_PATTERN.exec(trimmed);
  if (!match) return { amount: trimmed, unit: null };

  return { amount: match[1], unit: match[2] };
}
