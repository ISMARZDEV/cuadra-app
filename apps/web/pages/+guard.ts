import { redirect } from "vike/abort";
import type { PageContext } from "vike/types";

import { pickLocale } from "../src/i18n/accept-language";
import { DEFAULT_COUNTRY } from "../src/i18n/config";

// URL sin prefijo válido de idioma/país → redirige a /{locale}/{country} preservando la ruta.
// El idioma se NEGOCIA desde el Accept-Language del browser (es/en/pt; default es); el país queda
// en el mercado #1 (DO) — multi-país es otro eje (F3).
//
// `/admin/*` es la consola OFV — herramienta interna, NUNCA superficie pública/SEO. No lleva
// prefijo idioma/país y tiene su PROPIO gate server-side (`pages/admin/+guard.ts`, capability-based)
// — exención primero, antes de tocar needsLocaleRedirect (que igual dispararía: "admin" no matchea
// como locale en onBeforeRoute.ts).
export function guard(pageContext: PageContext) {
  if (pageContext.urlPathname.startsWith("/admin")) return;

  if (pageContext.needsLocaleRedirect) {
    const path = pageContext.urlPathname === "/" ? "" : pageContext.urlPathname;
    const locale = pickLocale(pageContext.acceptLanguage);
    throw redirect(`/${locale}/${DEFAULT_COUNTRY}${path}`);
  }
}
