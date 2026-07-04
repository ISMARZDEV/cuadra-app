import type { ReactNode } from "react";

import { CountrySwitcher, LocaleSwitcher } from "../src/components/switcher";
import { COUNTRY_NAMES } from "../src/i18n/config";
import { usePageI18n } from "../src/i18n/usePageI18n";
import { localeHref } from "../src/lib/links";

import "./style.css";

// Shell común a todas las páginas. Marca Cuadra Save (verde). Nav + brand con links prefijados
// (idioma/país), selector de idioma y país. Todo localizado.
export function Layout({ children }: { children: ReactNode }) {
  const { locale, country, t } = usePageI18n();
  return (
    <div className="app">
      <header className="topbar">
        <a href={localeHref(locale, country, "/")} className="brand">
          Cuadra <span>Save</span>
        </a>
        <div className="topbar-right">
          <a href={localeHref(locale, country, "/search")}>{t("nav.search")}</a>
          <CountrySwitcher />
          <LocaleSwitcher />
        </div>
      </header>
      <div className="content">{children}</div>
      <footer className="foot">
        {t("footer.tagline")} · {COUNTRY_NAMES[locale][country]}
      </footer>
    </div>
  );
}
