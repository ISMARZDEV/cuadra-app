import { useData } from "vike-react/useData";

import { localeHref } from "../../src/lib/links";
import { usePageI18n } from "../../src/i18n/usePageI18n";
import type { SearchData } from "./+data";

export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { q, results } = useData<SearchData>();
  return (
    <main>
      <h1>{t("search.title")}</h1>
      <form method="get" action={localeHref(locale, country, "/search")}>
        <input type="search" name="q" defaultValue={q} placeholder={t("search.placeholder")} />
        <button type="submit">{t("search.button")}</button>
      </form>
      {q && (
        <p>
          {results.length} {t("search.resultsFor")} <strong>{q}</strong>
        </p>
      )}
      <ul>
        {results.map((product) => (
          <li key={product.id}>
            <a href={localeHref(locale, country, `/product/${product.id}`)}>
              {product.name} {product.brand && <span>· {product.brand}</span>}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
