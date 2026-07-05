import { useData } from "vike-react/useData";

import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { CategoryData } from "../types";
import { Breadcrumbs } from "./breadcrumbs";
import { categoryIcon } from "./category-icons";
import { ProductRail } from "./product-rail";

// Overview de una categoría TOPE (breadcrumb de 1, ruta /categorias/): sidebar de las 15 tope +
// grid de tiles de subcategoría + rail de populares. SIN productos (eso es el Listing). Calca la
// plantilla de SupermercadosRD.
export function CategoryOverview() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);
  const productHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${slug}`);
  const trail = cat.breadcrumb.slice(0, -1);
  const topSlug = cat.breadcrumb[0]?.slug;
  const popular = cat.popular ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={trail} currentName={cat.name} />

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5">
          {cat.categories.map((c) => {
            const Icon = categoryIcon(c.slug);
            const active = c.slug === topSlug;
            return (
              <a
                key={c.slug}
                href={catHref(c.slug)}
                className={
                  active
                    ? "flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5 text-sm font-semibold text-secondary-foreground"
                    : "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-primary"
                }
              >
                <Icon className="size-4" strokeWidth={1.5} />
                {c.name}
              </a>
            );
          })}
        </nav>

        <div>
          <h1 className="text-2xl font-bold">{cat.name}</h1>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cat.subcategories.map((s) => {
              const Icon = categoryIcon(s.slug);
              return (
                <a
                  key={s.slug}
                  href={catHref(s.slug)}
                  className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center transition-colors hover:border-primary"
                >
                  <Icon
                    className="size-9 text-muted-foreground group-hover:text-primary"
                    strokeWidth={1.25}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                </a>
              );
            })}
          </div>

          {popular.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">{t("category.popular")}</h2>
              <ProductRail products={popular} locale={locale} productHref={productHref} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
