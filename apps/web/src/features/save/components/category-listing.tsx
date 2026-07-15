import { categoryProducts } from "@cuadra/api-client";
import { useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { marketOf } from "@/i18n/config";
import { format } from "@/i18n/messages";
import { usePageI18n } from "@/i18n/usePageI18n";
import { apiClient } from "@/lib/api";
import { localeHref, logicalPath } from "@/lib/links";

import { DEFAULT_SORT, PAGE_SIZE, parseViewMode } from "../enums";
import { asList } from "../lib/query";
import type { CategoryData } from "../types";
import { Breadcrumbs } from "./breadcrumbs";
import { CategoryFilters } from "./category-filters";
import { categoryIcon } from "./category-icons";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";

// Listing de un nodo profundo (grupo/subcategoría, ruta /grupos/): productos de TODA la rama (el
// backend agrega descendientes) + filtros (sidebar) + orden + pills de subcategorías hijas +
// vista "cargar más"/paginada. El estado filtrable vive en la URL → SSR compartible/indexable.
export function CategoryListing() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const pageContext = usePageContext();
  const search = pageContext.urlParsed.search as Record<string, string | undefined>;
  const slug = pageContext.routeParams.slug as string;
  const viewMode = parseViewMode(search.view);

  // Acumulación de "Ver más": sembrada con el batch SSR, resetea si cambian filtros/orden/slug
  // (llega un `cat.products` nuevo por navegación client-side sin remount del componente).
  const [items, setItems] = useState(cat.products);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => setItems(cat.products), [cat.products]);

  const productHref = (s: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${s}`);
  const catHref = (s: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${s}`);

  const navigateWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...search, ...patch })) {
      if (v && !(k === "sort" && v === DEFAULT_SORT)) params.set(k, v);
    }
    const qs = params.toString();
    // urlPathname viene SIN el prefijo /{locale}/{country}; re-prefijar o navigate aborta.
    const base = localeHref(locale, country, logicalPath(pageContext.urlPathname));
    void navigate(qs ? `${base}?${qs}` : base);
  };

  const onSort = (value: string) => navigateWith({ sort: value, page: undefined });

  const goToPage = (page: number) => navigateWith({ page: String(page) });

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await categoryProducts({
      client: apiClient,
      path: { slug },
      query: {
        market: marketOf(country),
        stores: asList(search.stores),
        brands: asList(search.brands),
        price_min: search.pmin ? Number(search.pmin) : undefined,
        price_max: search.pmax ? Number(search.pmax) : undefined,
        sort: search.sort ?? DEFAULT_SORT,
        limit: PAGE_SIZE,
        offset: items.length,
      },
    });
    if (res.data) setItems((prev) => [...prev, ...res.data.products]);
    setLoadingMore(false);
  };

  const totalPages = Math.max(1, Math.ceil(cat.total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={cat.breadcrumb.slice(0, -1)} currentName={cat.name} />

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <CategoryFilters facets={cat.facets} locale={locale} />

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold">{cat.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {cat.total} {t("category.products")}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("category.sortBy")}
              <Select value={search.sort ?? DEFAULT_SORT} onValueChange={onSort}>
                <SelectTrigger size="sm" className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">{t("sort.popular")}</SelectItem>
                  <SelectItem value="price">{t("sort.price")}</SelectItem>
                  <SelectItem value="unit_price">{t("sort.unitPrice")}</SelectItem>
                  <SelectItem value="name">{t("sort.name")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {cat.subcategories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {cat.subcategories.map((s) => {
                const Icon = categoryIcon(s.slug);
                return (
                  <a
                    key={s.slug}
                    href={catHref(s.slug)}
                    className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2 pr-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4 text-secondary-foreground" strokeWidth={1.5} />
                    </span>
                    {s.name}
                  </a>
                );
              })}
            </div>
          )}

          {items.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">{t("category.empty")}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} href={productHref(p.slug)} locale={locale} />
              ))}
            </div>
          )}

          {viewMode === "pages" ? (
            <Pagination page={cat.page} totalPages={totalPages} onNavigate={goToPage} />
          ) : (
            items.length < cat.total && (
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {format(locale, "category.seen", {
                    shown: String(items.length),
                    total: String(cat.total),
                  })}
                </p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(items.length / cat.total) * 100}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full border border-border px-6 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50"
                >
                  {t("category.loadMore")}
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
