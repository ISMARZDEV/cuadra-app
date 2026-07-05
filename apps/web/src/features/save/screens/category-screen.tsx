import { useData } from "vike-react/useData";

import { CategoryListing } from "../components/category-listing";
import { CategoryOverview } from "../components/category-overview";
import type { CategoryData } from "../types";

// Screen de categoría (Imagen #6/#8): elige plantilla según el nivel del nodo.
// - Categoría TOPE con subcategorías → Overview (sidebar de las 15 tope + tiles + populares).
// - Nodo profundo / leaf → Listing (productos de la rama + filtros + orden + paginación).
// El screen es SOLO composición; cada plantilla es su propio componente del feature.
export function CategoryScreen() {
  const cat = useData<CategoryData>();
  const isTopLevel = cat.breadcrumb.length <= 1;
  return isTopLevel && cat.subcategories.length > 0 ? <CategoryOverview /> : <CategoryListing />;
}
