import type { CategoryNodeDto, ProductCardDto } from "@cuadra/api-client";

import type { TabItem } from "./components/category-tabs";

/** Las dos listas TRANSVERSALES de Supermarket. No viven en el árbol de categorías —un producto en
 *  oferta sigue siendo lácteo—, así que son pestañas propias y su id es reservado. */
export const LIST_TABS = ["deals", "featured"] as const;
export type ListTab = (typeof LIST_TABS)[number];

/** `deals` | `featured` | el slug de una categoría. */
export type TabId = string;

export const isListTab = (id: TabId): id is ListTab =>
  (LIST_TABS as readonly string[]).includes(id);

/**
 * Las pestañas del «ver más»: las dos listas transversales primero, las categorías del árbol detrás.
 *
 * Las dos van SIEMPRE, no sólo aquella de la que vino el usuario: teniéndolas las dos se puede
 * saltar de ofertas a destacados sin volver atrás, y además el título deja de repetir a la primera
 * pestaña — que es lo que pasaba cuando la de origen era la única.
 */
export function buildTabs(
  labels: Record<ListTab, string>,
  categories: CategoryNodeDto[],
): TabItem[] {
  return [
    ...LIST_TABS.map((id) => ({ slug: id, name: labels[id] })),
    ...categories.map((c) => ({ slug: c.slug, name: c.name })),
  ];
}

/** Sin tildes y en minúsculas. Nadie escribe «Melocotón» con su tilde en un buscador de súper, y que
 *  eso no encuentre nada sería un defecto y no una búsqueda estricta. */
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Filtra en MEMORIA lo que ya está en pantalla. No consulta al servidor — ver `search-bar` para el
 * porqué. Busca en el nombre y en la marca, que son los dos textos que el usuario ve en la tarjeta.
 */
export function filterByQuery(products: ProductCardDto[], query: string): ProductCardDto[] {
  const needle = fold(query.trim());
  if (!needle) return products;
  return products.filter(
    (p) => fold(p.name).includes(needle) || fold(p.brand ?? "").includes(needle),
  );
}
