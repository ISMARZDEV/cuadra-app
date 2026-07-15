import { Search } from "lucide-react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { categoryIcon } from "../components/category-icons";
import { ProviderBadge } from "../components/provider-badge";
import { SectionRail } from "../components/section-rail";
import type { SupermarketsData } from "../types";

// Inicio de Supermercados (Imagen #3): hero de búsqueda · fila de categorías con íconos (Lucide) ·
// rails de productos reales (Ofertas de hoy A7, Populares, Mejor valor A10, colecciones A6, tiendas
// A9). Los rails sin datos no se muestran (SectionRail devuelve null si vacío).
export function SupermarketsScreen() {
  const { locale, country, t } = usePageI18n();
  const { categories, deals, popular, providers, bestValue, collections } =
    useData<SupermarketsData>();
  const base = (path: string) => localeHref(locale, country, `/save/supermarkets${path}`);
  const productHref = (slug: string) => base(`/product/${slug}`);
  const storeHref = (id: string) => base(`/store/${id}`);
  const collectionHref = (slug: string) => base(`/collection/${slug}`);

  return (
    <div>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">{t("super.title")}</h1>
          <p className="mx-auto mt-2 max-w-2xl opacity-90">{t("super.subtitle")}</p>
          <form method="get" action={base("/search")} className="mx-auto mt-6 flex max-w-xl gap-2">
            <Input
              name="q"
              placeholder={t("super.searchPlaceholder")}
              className="border-0 bg-background text-foreground"
            />
            <Button type="submit" variant="secondary" size="icon" aria-label={t("search.button")}>
              <Search className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      <nav className="border-b border-border">
        <ul className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 py-4">
          {categories.map((c) => {
            const Icon = categoryIcon(c.slug);
            return (
              <li key={c.slug}>
                <a
                  href={base(`/category/${c.slug}`)}
                  className="flex w-16 flex-col items-center gap-1.5 text-center text-muted-foreground hover:text-primary"
                >
                  <Icon className="size-6" strokeWidth={1.5} />
                  <span className="text-[11px] font-medium leading-tight">{c.name}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <SectionRail
        title={t("super.bestOffers")}
        products={deals}
        locale={locale}
        productHref={productHref}
      />
      <SectionRail
        title={t("super.popular")}
        products={popular}
        locale={locale}
        productHref={productHref}
      />

      {/* Carruseles curados (A6): colecciones editoriales hand-pick (Protector solar, Limpieza). */}
      {collections.map((c) => (
        <SectionRail
          key={c.slug}
          title={c.name}
          products={c.products}
          locale={locale}
          productHref={productHref}
          seeAll={t("super.seeAll")}
          seeAllHref={collectionHref(c.slug)}
        />
      ))}

      {providers.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-6">
          <h2 className="mb-3 text-lg font-semibold">{t("super.offersByStore")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {providers.map((p) => (
              <a
                key={p.id}
                href={storeHref(p.id)}
                className="flex h-16 items-center justify-center rounded-lg border border-border bg-card px-3 text-center text-sm font-bold transition-colors hover:border-primary hover:text-primary"
              >
                <ProviderBadge name={p.name} logoUrl={p.logo_url} />
              </a>
            ))}
          </div>
        </section>
      )}

      <SectionRail
        title={t("super.bestValue")}
        products={bestValue}
        locale={locale}
        productHref={productHref}
      />
    </div>
  );
}
