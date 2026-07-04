import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionRail } from "@/components/section-rail";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";
import { slugify } from "@/lib/utils";

// Inicio de Supermercados (Imagen #4): hero de búsqueda · fila de categorías · rails de
// ofertas/populares/tiendas/inspiración. Estructura + rutas; los datos de los rails se cablean luego.
const CATEGORIES = [
  "Alcohol", "Bebés", "Bebidas", "Proteínas", "Hogar", "Cuidado", "Despensa",
  "Embutidos", "Escolares", "Frutas", "Lácteos", "Mascotas", "Panadería", "Salud", "Snacks",
];

export default function Page() {
  const { locale, country, t } = usePageI18n();
  const base = (path: string) => localeHref(locale, country, `/save/supermarkets${path}`);

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
        <ul className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 py-3">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <a
                href={base(`/category/${slugify(c)}`)}
                className="whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-primary"
              >
                {c}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <SectionRail title={t("super.bestOffers")} seeAll={t("super.seeAll")} />
      <SectionRail title={t("super.popular")} seeAll={t("super.seeAll")} />
      <SectionRail title={t("super.offersByStore")} />
      <SectionRail title={t("super.inspiration")} />
      <SectionRail title={t("super.bestValue")} seeAll={t("super.seeAll")} />
    </div>
  );
}
