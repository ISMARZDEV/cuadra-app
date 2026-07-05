// Tipos de dominio del feature Save (aliases/uniones). PURO (Layer 1). Los screens tipan su
// `useData<…>()` desde acá — no desde pages/ — para no depender "hacia atrás" del router Vike.
import type {
  CategoryListingDto,
  CategoryTreeDto,
  CollectionDto,
  PriceComparisonDto,
  PriceHistoryDto,
  ProductCardDto,
  ProductSearchDto,
  ProviderPageDto,
  ProviderRefDto,
} from "@cuadra/api-client";

// Datos SSR de la página de categoría: el listado (breadcrumb + subcats + cards + facetas) + el
// árbol de categorías tope (sidebar del Overview) + la página actual (paginación). Es exactamente
// lo que arma `+data` (`{ ...CategoryListingDto, categories, page }`).
export type CategoryData = CategoryListingDto & {
  categories: CategoryTreeDto["categories"];
  page: number;
};

// Datos SSR de la búsqueda: el término + los resultados (por mercado del país de la URL).
export type SearchData = { q: string; results: ProductSearchDto[] };

// Datos SSR de una colección curada (A6) / un supermercado (A9): nombre + sus productos.
export type CollectionData = CollectionDto;
export type StoreData = ProviderPageDto;

// Datos SSR del árbol de categorías (página "todas las categorías").
export type CategoriesData = { categories: CategoryTreeDto["categories"] };

// Datos SSR de la página de producto (Imagen #2): la comparación entre tiendas + el historial de
// precios (C9) + "más de la marca" + `nowMs` del servidor (ejes de fecha estables en la hidratación).
export type ProductData = {
  comparison: PriceComparisonDto;
  history: PriceHistoryDto | null;
  brandProducts: ProductCardDto[];
  nowMs: number;
};

// Datos SSR de la home de Supermercados: categorías (fila de íconos) + los rails (ofertas del día
// A7, populares, mejor valor A10), proveedores (A9) y colecciones curadas (A6).
export type SupermarketsData = {
  categories: CategoryTreeDto["categories"];
  deals: ProductCardDto[];
  popular: ProductCardDto[];
  providers: ProviderRefDto[];
  bestValue: ProductCardDto[];
  collections: CollectionDto[];
};
