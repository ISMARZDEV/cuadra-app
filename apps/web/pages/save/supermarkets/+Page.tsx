import { Search } from "lucide-react";
import { useData } from "vike-react/useData";

import { SectionRail } from "@/components/section-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageI18n } from "@/i18n/usePageI18n";
import { categoryIcon } from "@/lib/category-icons";
import { localeHref } from "@/lib/links";

import type { SupermarketsData } from "./+data";

// Inicio de Supermercados (Imagen #3): hero de búsqueda · fila de categorías con íconos (Lucide) ·
// rails de productos reales (Mejor valor, Populares). Rails sin datos no se muestran.
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { categories, bestValue, popular } = useData<SupermarketsData>();
  const base = (path: string) => localeHref(locale, country, `/save/supermarkets${path}`);
  const productHref = (id: string) => base(`/product/${id}`);

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
        title={t("super.bestValue")}
        products={bestValue}
        locale={locale}
        productHref={productHref}
      />
      <SectionRail
        title={t("super.popular")}
        products={popular}
        locale={locale}
        productHref={productHref}
      />
    </div>
  );
}
