import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryFilters } from "@/components/category-filters";
import { ProductCard } from "@/components/product-card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { CategoryData } from "./+data";

// Listado por categoría (Imagen #5): breadcrumb · sidebar de filtros (precio/tienda/marca) ·
// subcategorías · orden · grid de cards. URL-driven: filtros y orden viven en la query → SSR.
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const pageContext = usePageContext();
  const search = pageContext.urlParsed.search as Record<string, string | undefined>;

  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);
  // breadcrumb = ancestros sin el nodo actual (el actual va como currentName)
  const trail = cat.breadcrumb.slice(0, -1);

  const onSort = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams();
    // omite sort=price (el default) para mantener las URLs limpias
    for (const [k, v] of Object.entries({ ...search, sort: e.target.value })) {
      if (v && !(k === "sort" && v === "price")) params.set(k, v);
    }
    const qs = params.toString();
    void navigate(qs ? `${pageContext.urlPathname}?${qs}` : pageContext.urlPathname);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={trail} currentName={cat.name} />

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <CategoryFilters facets={cat.facets} locale={locale} />

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">{cat.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {cat.total} {t("category.products")}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("category.sortBy")}
              <select
                value={search.sort ?? "price"}
                onChange={onSort}
                className="rounded-md border border-border bg-card px-2 py-1 text-foreground"
              >
                <option value="price">{t("sort.price")}</option>
                <option value="unit_price">{t("sort.unitPrice")}</option>
                <option value="name">{t("sort.name")}</option>
              </select>
            </label>
          </div>

          {cat.subcategories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {cat.subcategories.map((s) => (
                <a
                  key={s.slug}
                  href={catHref(s.slug)}
                  className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                    {s.name.charAt(0)}
                  </span>
                  {s.name}
                </a>
              ))}
            </div>
          )}

          {cat.products.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">{t("category.empty")}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {cat.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  href={productHref(p.id)}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
