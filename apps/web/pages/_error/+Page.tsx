import { usePageContext } from "vike-react/usePageContext";

import { localeHref } from "../../src/lib/links";
import { usePageI18n } from "../../src/i18n/usePageI18n";

// Página de error. Sin ella, un `throw render(404)` cae a 500 (soft-404, malo para SEO). Con
// ella, Vike renderiza este contenido CON el status correcto (404 / 500).
export default function Page() {
  const pageContext = usePageContext();
  const { locale, country, t } = usePageI18n();
  const is404 = pageContext.is404 ?? false;
  return (
    <main>
      <h1>{is404 ? t("error.notFoundTitle") : t("error.genericTitle")}</h1>
      <p>{is404 ? t("error.notFoundBody") : t("error.genericBody")}</p>
      <p>
        <a href={localeHref(locale, country, "/")}>{t("error.backHome")}</a>
      </p>
    </main>
  );
}
