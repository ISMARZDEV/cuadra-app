import { usePageContext } from "vike-react/usePageContext";

import {
  COUNTRIES,
  COUNTRY_NAMES,
  DEFAULT_COUNTRY,
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_NAMES,
  type Country,
  type Locale,
} from "../i18n/config";
import { localeHref, logicalPath } from "../lib/links";

// Selectores de idioma y país: enlaces a la MISMA página lógica cambiando el prefijo. Son <a>
// (navegación real) para que el SSR entregue la versión localizada correcta.
export function LocaleSwitcher() {
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const path = logicalPath(pageContext.urlPathname);
  return (
    <nav className="switch" aria-label="Idioma">
      {LOCALES.map((loc) => (
        <a
          key={loc}
          href={localeHref(loc, country, path)}
          className={loc === locale ? "active" : ""}
          hrefLang={loc}
        >
          {LOCALE_NAMES[loc]}
        </a>
      ))}
    </nav>
  );
}

export function CountrySwitcher() {
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const path = logicalPath(pageContext.urlPathname);
  if (COUNTRIES.length < 2) {
    // un solo país: mostramos el actual sin selector (habrá más: US/CO/BR…).
    return <span className="country">{COUNTRY_NAMES[locale][country]}</span>;
  }
  return (
    <nav className="switch" aria-label="País">
      {COUNTRIES.map((c) => (
        <a key={c} href={localeHref(locale, c, path)} className={c === country ? "active" : ""}>
          {COUNTRY_NAMES[locale][c]}
        </a>
      ))}
    </nav>
  );
}
