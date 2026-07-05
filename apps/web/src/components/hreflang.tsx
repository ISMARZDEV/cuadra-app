import { usePageContext } from "vike-react/usePageContext";

import { DEFAULT_COUNTRY, DEFAULT_LOCALE, LOCALES, type Country } from "../i18n/config";
import { localeHref, logicalPath } from "../lib/links";

// <link rel="alternate" hreflang> para CADA idioma del mismo país + x-default → SEO multilingüe
// (Google entiende que /es/do y /en/do son la misma página en otro idioma). Global (todas las
// páginas) vía el Head de +config. El origin viene de VITE_SITE_URL en build.
const SITE = import.meta.env.VITE_SITE_URL ?? "http://localhost:3006";

export function HreflangTags() {
  const pageContext = usePageContext();
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const path = logicalPath(pageContext.urlPathname);
  const origin = SITE.replace(/\/$/, "");
  return (
    <>
      {LOCALES.map((loc) => (
        <link
          key={loc}
          rel="alternate"
          hrefLang={`${loc}-${country}`}
          href={`${origin}${localeHref(loc, country, path)}`}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`${origin}${localeHref(DEFAULT_LOCALE, country, path)}`}
      />
    </>
  );
}
