import { usePageContext } from "vike-react/usePageContext";

import {
  COUNTRIES,
  COUNTRY_NAMES,
  DEFAULT_COUNTRY,
  DEFAULT_LOCALE,
  LOCALES,
  type Country,
  type Locale,
} from "@/i18n/config";
import { localeHref, logicalPath } from "@/lib/links";

// Selectores de idioma y país: enlaces a la MISMA página lógica cambiando el prefijo (navegación
// real → el SSR entrega la versión localizada). País muestra el actual mientras haya uno solo.
export function LocaleSwitcher() {
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const path = logicalPath(pageContext.urlPathname);
  return (
    <div className="flex items-center gap-1 text-xs font-semibold uppercase" aria-label="Idioma">
      {LOCALES.map((loc) => (
        <a
          key={loc}
          href={localeHref(loc, country, path)}
          hrefLang={loc}
          className={loc === locale ? "text-primary" : "text-muted-foreground hover:text-foreground"}
        >
          {loc}
        </a>
      ))}
    </div>
  );
}

export function CountrySwitcher() {
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const path = logicalPath(pageContext.urlPathname);
  if (COUNTRIES.length < 2) {
    return (
      <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
        {country.toUpperCase()}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs font-semibold uppercase" aria-label="País">
      {COUNTRIES.map((c) => (
        <a
          key={c}
          href={localeHref(locale, c, path)}
          title={COUNTRY_NAMES[locale][c]}
          className={c === country ? "text-primary" : "text-muted-foreground hover:text-foreground"}
        >
          {c}
        </a>
      ))}
    </div>
  );
}
