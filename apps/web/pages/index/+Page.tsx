import { localeHref } from "../../src/lib/links";
import { usePageI18n } from "../../src/i18n/usePageI18n";

// Landing pública localizada (SSR → indexable por idioma+país). El buscador es un form GET
// al /search prefijado (sin JS de cliente).
export default function Page() {
  const { locale, country, t } = usePageI18n();
  return (
    <main>
      <h1>{t("home.title")}</h1>
      <p>{t("home.subtitle")}</p>
      <form method="get" action={localeHref(locale, country, "/search")}>
        <input type="search" name="q" placeholder={t("home.searchPlaceholder")} />
        <button type="submit">{t("search.button")}</button>
      </form>
    </main>
  );
}
