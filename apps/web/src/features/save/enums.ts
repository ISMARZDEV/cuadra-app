// Valores de WIRE de Save (params de URL) → union string-literal `as const`, NO enum de TS.
// Regla de tipos (paridad con mobile): `enum` para sets de dominio cerrados; `as const` para lo que
// viaja por la red/URL (aquí: orden y modo de vista de la página de categoría). PURO (Layer 1).

export const SORT = ["popular", "price", "unit_price", "name"] as const;
export type Sort = (typeof SORT)[number];
export const DEFAULT_SORT: Sort = "price";

export const VIEW_MODE = ["loadmore", "pages"] as const;
export type ViewMode = (typeof VIEW_MODE)[number];
export const DEFAULT_VIEW_MODE: ViewMode = "loadmore";

export const PAGE_SIZE = 40; // batch del listado por categoría (4 col × 10 filas, calca la referencia)

/** Normaliza el `?sort=` de la URL a un `Sort` válido (default = price). */
export function parseSort(v: string | undefined): Sort {
  return (SORT as readonly string[]).includes(v ?? "") ? (v as Sort) : DEFAULT_SORT;
}

/** Normaliza el `?view=` de la URL a un `ViewMode` válido (default = loadmore). */
export function parseViewMode(v: string | undefined): ViewMode {
  return v === "pages" ? "pages" : DEFAULT_VIEW_MODE;
}
