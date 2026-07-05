import { categoryProducts } from "@cuadra/api-client";
import { useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryFilters } from "@/components/category-filters";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
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
import { categoryIcon } from "@/lib/category-icons";
import { localeHref, logicalPath } from "@/lib/links";

import { PAGE_SIZE, type CategoryData } from "./+data";

// Categoría (Imagen #6/#8), calcando a SupermercadosRD:
// - Categoría TOPE (breadcrumb de 1, ruta /categorias/): Overview puro → sidebar de las 15 tope +
//   grid de tiles de subcategoría + populares. SIN productos.
// - Nodo más profundo (grupo/subcategoría, ruta /grupos/): Listing con los productos de TODA la
//   rama (el backend ya agrega descendientes) + pills de sus subcategorías hijas arriba para
//   seguir filtrando. Un leaf es lo mismo pero sin pills (no tiene hijos).
export default function Page() {
  const cat = useData<CategoryData>();
  const isTopLevel = cat.breadcrumb.length <= 1;
  return isTopLevel && cat.subcategories.length > 0 ? <CategoryOverview /> : <CategoryListing />;
}

function CategoryOverview() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);
  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);
  const trail = cat.breadcrumb.slice(0, -1);
  const topSlug = cat.breadcrumb[0]?.slug;
  const popular = cat.popular ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={trail} currentName={cat.name} />

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
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
              <div className="flex gap-4 overflow-x-auto pb-2">
                {popular.map((p) => (
                  <div key={p.id} className="w-40 shrink-0">
                    <ProductCard product={p} href={productHref(p.id)} locale={locale} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const asList = (v: string | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

function CategoryListing() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const pageContext = usePageContext();
  const search = pageContext.urlParsed.search as Record<string, string | undefined>;
  const slug = pageContext.routeParams.slug as string;
  const viewMode = search.view === "pages" ? "pages" : "loadmore";

  // Acumulación de "Ver más": sembrada con el batch SSR, resetea si cambian filtros/orden/slug
  // (llega un `cat.products` nuevo por navegación client-side sin remount del componente).
  const [items, setItems] = useState(cat.products);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => setItems(cat.products), [cat.products]);

  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);
  const catHref = (s: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${s}`);

  const navigateWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...search, ...patch })) {
      if (v && !(k === "sort" && v === "price")) params.set(k, v);
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
        sort: search.sort ?? "price",
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("category.sortBy")}
              <Select value={search.sort ?? "price"} onValueChange={onSort}>
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
                <ProductCard key={p.id} product={p} href={productHref(p.id)} locale={locale} />
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
