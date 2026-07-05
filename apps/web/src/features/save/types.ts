// Tipos de dominio del feature Save (aliases/uniones). PURO (Layer 1). Los screens tipan su
// `useData<…>()` desde acá — no desde pages/ — para no depender "hacia atrás" del router Vike.
import type { CategoryListingDto, CategoryTreeDto } from "@cuadra/api-client";

// Datos SSR de la página de categoría: el listado (breadcrumb + subcats + cards + facetas) + el
// árbol de categorías tope (sidebar del Overview) + la página actual (paginación). Es exactamente
// lo que arma `+data` (`{ ...CategoryListingDto, categories, page }`).
export type CategoryData = CategoryListingDto & {
  categories: CategoryTreeDto["categories"];
  page: number;
};
