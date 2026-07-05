import { redirect } from "vike/abort";
import type { PageContext } from "vike/types";

import { DEFAULT_COUNTRY, DEFAULT_LOCALE } from "../src/i18n/config";

// URL sin prefijo válido de idioma/país → redirige a /{locale}/{country} preservando la ruta.
// (Detección por Accept-Language = follow-up; hoy default es-do, mercado #1.)
export function guard(pageContext: PageContext) {
  if (pageContext.needsLocaleRedirect) {
    const path = pageContext.urlPathname === "/" ? "" : pageContext.urlPathname;
    throw redirect(`/${DEFAULT_LOCALE}/${DEFAULT_COUNTRY}${path}`);
  }
}
