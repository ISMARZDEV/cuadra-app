import type { PageContext } from "vike/types";

import {
  DEFAULT_COUNTRY,
  DEFAULT_LOCALE,
  isCountry,
  isLocale,
} from "../src/i18n/config";

// Extrae el prefijo /{locale}/{country} de la URL y expone la ruta LÓGICA a Vike (así las páginas
// viven en /product, /search, / sin importar idioma/país). Sin prefijo válido → marca redirect.
export function onBeforeRoute(pageContext: PageContext) {
  const segments = pageContext.urlPathname.split("/").filter(Boolean);
  const [first, second, ...rest] = segments;
  // preserva el query string (?q=…) al reescribir la ruta lógica, si no la búsqueda pierde `q`.
  const search = pageContext.urlParsed.searchOriginal ?? "";

  if (isLocale(first) && isCountry(second)) {
    return {
      pageContext: {
        locale: first,
        country: second,
        urlLogical: "/" + rest.join("/") + search,
      },
    };
  }

  return {
    pageContext: {
      locale: DEFAULT_LOCALE,
      country: DEFAULT_COUNTRY,
      needsLocaleRedirect: true,
      // Preserva el query string también acá (rama sin prefijo locale/país, ej. `/admin/*`): sin
      // esto Vike deriva `urlParsed.search` de un `urlLogical` sin `?…` → los filtros/orden/
      // paginación del admin NUNCA llegan a `data()` (bug de la cola de revisión).
      urlLogical: pageContext.urlPathname + (pageContext.urlParsed.searchOriginal ?? ""),
    },
  };
}
