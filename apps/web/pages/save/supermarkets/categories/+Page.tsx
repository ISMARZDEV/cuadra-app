import { useData } from "vike-react/useData";

import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { CategoriesData } from "./+data";

// Todas las categorías (Imagen #6): sidebar de categorías + grid de categorías top. Datos reales
// (taxonomía del backend). Cada card lleva a su página de categoría (breadcrumb + subcategorías).
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { categories } = useData<CategoriesData>();
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[220px_1fr]">
      <aside>
        <ul className="space-y-1 text-sm">
          {categories.map((c) => (
            <li key={c.slug}>
              <a href={catHref(c.slug)} className="block rounded-md px-3 py-2 hover:bg-secondary">
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </aside>
      <div>
        <h1 className="mb-4 text-2xl font-bold">{t("categories.title")}</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <a key={c.slug} href={catHref(c.slug)}>
              <Card className="flex h-32 items-end bg-muted/30 p-3 text-sm font-medium hover:border-primary">
                {c.name}
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
