import { useData } from "vike-react/useData";

import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { SearchData } from "./+data";

export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { q, results } = useData<SearchData>();
  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t("search.title")}</h1>
      <form
        method="get"
        action={localeHref(locale, country, "/save/supermarkets/search")}
        className="mt-4 flex max-w-xl gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("search.placeholder")}
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {t("search.button")}
        </button>
      </form>

      {q && (
        <p className="mt-6 text-sm text-muted-foreground">
          {results.length} {t("search.resultsFor")}{" "}
          <strong className="text-foreground">{q}</strong>
        </p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {results.map((product) => (
          <li key={product.id} className="py-3">
            <a href={productHref(product.slug)} className="hover:text-primary">
              {product.name}
              {product.brand && <span className="text-muted-foreground"> · {product.brand}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
