// Parsers de los params de URL de Save (filtros multi-valor). PURO — sin React ni DOM (Layer 1,
// candidato a `packages/`). Antes estaba duplicado en category-filters y el +Page de categoría
// (una versión trimeaba, la otra no) → una sola fuente de verdad, con trim.

/** "a,b , c" → ["a","b","c"]; undefined/"" → []. Trimea y descarta vacíos. */
export const asList = (v: string | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
