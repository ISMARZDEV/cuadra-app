// Color de badge por slug de categoría (Figma nodo 502:6713, Fase 1 de docs/sdd/admin-workspace.md).
// Mirrorea el patrón data-driven de `categoryIcon(slug)` (features/save/components/category-icons.tsx):
// un slug desconocido/null NUNCA rompe la UI, cae a un neutro elegante.
//
// Slugs resueltos contra el mapa REAL de `category-icons.tsx` (fuente de verdad de slugs hoy, ya
// que la clasificación de categorías — cambio `save-category-classification` — todavía no persiste
// la taxonomía en DB):
// - "Bebidas" (Figma) = bebidas (no-alcohólicas); "Alcohólicas" (Figma) = alcohol. Son 2 slugs
//   distintos en `category-icons.tsx` (bebidas / alcohol), no un duplicado.
// - "Ofertas de la semana" NO es una categoría de la taxonomía (no existe en `category-icons.tsx`
//   ni en `taxonomy.py`) — corresponde al feed de bajadas de precio (A7, `PriceDropDto`/`drops.py`),
//   un concepto de dominio distinto. Se incluye igual con un slug sintético (`ofertas-de-la-semana`,
//   vía el mismo `slugify` que usa el backend) para que un futuro badge de "oferta" tenga color listo,
//   pero OJO: no hay garantía de que este slug exista nunca como Category real.
// - Faltan 2 slugs del set de 15 (`lacteos-huevos`, `mascotas` en `category-icons.tsx`) sin color en
//   el Figma (nodo 502:6713 solo trae 14) — caen al fallback neutro hasta que el usuario dé su color.
export interface CategoryColor {
  bg: string;
  text: string;
}

const NEUTRAL_FALLBACK: CategoryColor = { bg: "#f1f5f4", text: "#64748b" };

const CATEGORY_COLORS: Record<string, CategoryColor> = {
  "panaderia-tortilleria": { bg: "#ffedd4", text: "#e18200" },
  bebes: { bg: "#f7f7f7", text: "#979797" },
  bebidas: { bg: "#ffe2f8", text: "#d308a2" },
  "frutas-verduras": { bg: "#dfffc8", text: "#335e00" },
  "snacks-dulces": { bg: "#ffe7e7", text: "#e1000b" },
  "despensa-abarrotes": { bg: "#edfff2", text: "#034842" },
  alcohol: { bg: "#ffeded", text: "#952325" },
  "cuidado-del-hogar": { bg: "#d1feff", text: "#239b9d" },
  "cuidado-personal": { bg: "#e9fff5", text: "#00904c" },
  "embutidos-delicatessen": { bg: "#edfbff", text: "#29a2c6" },
  "carnes-pescados": { bg: "#fffbec", text: "#937800" },
  "salud-farmacia": { bg: "#e8fff8", text: "#169672" },
  "ofertas-de-la-semana": { bg: "#faffe3", text: "#475537" },
  "escolares-oficina": { bg: "#f3edff", text: "#8559e2" },
};

export function categoryColor(slug: string | null | undefined): CategoryColor {
  if (!slug) return NEUTRAL_FALLBACK;
  return CATEGORY_COLORS[slug] ?? NEUTRAL_FALLBACK;
}
