import { useData } from "vike-react/useData";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { CategoryData } from "./+data";

// Listado por categoría (Imagen #8): breadcrumb · sidebar de filtros (skeleton) · subcategorías ·
// grid de productos. Breadcrumb/subcats/productos con datos reales; filtros (precio/tienda) skeleton.
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const cat = useData<CategoryData>();
  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);
  // breadcrumb = ancestros sin el nodo actual (el actual va como currentName)
  const trail = cat.breadcrumb.slice(0, -1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={trail} currentName={cat.name} />

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <aside className="space-y-6 text-sm">
          <h2 className="font-semibold">{t("category.filters")}</h2>
          <div>
            <p className="mb-2 font-medium">{t("compare.price")}</p>
            <div className="h-2 rounded-full bg-secondary" />
          </div>
          <div>
            <p className="mb-2 font-medium">{t("compare.store")}</p>
            {["Merca Jumbo", "Nacional", "Sirena", "Bravo"].map((s) => (
              <label key={s} className="flex items-center gap-2 py-1 text-muted-foreground">
                <input type="checkbox" /> {s}
              </label>
            ))}
          </div>
        </aside>

        <div>
          <h1 className="text-2xl font-bold">{cat.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cat.products.length} {t("category.products")}
          </p>

          {cat.subcategories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {cat.subcategories.map((s) => (
                <a
                  key={s.slug}
                  href={catHref(s.slug)}
                  className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary"
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cat.products.map((p) => (
              <a key={p.id} href={productHref(p.id)}>
                <Card className="flex h-40 flex-col justify-end p-3 hover:border-primary">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.brand && <span className="text-xs text-muted-foreground">{p.brand}</span>}
                </Card>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
