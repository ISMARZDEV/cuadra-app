import { useData } from "vike-react/useData";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import type { StoreData } from "./+data";

// Página propia de un supermercado (A9): nombre + su catálogo (precio de ESA tienda, no el
// mínimo cross-tienda — store_count sale en 1, es honesto para una vista de una sola tienda).
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { name, products } = useData<StoreData>();
  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={[]} currentName={name} />
      <h1 className="mt-4 text-2xl font-bold">{name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {products.length} {t("category.products")}
      </p>

      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">{t("category.empty")}</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} href={productHref(p.id)} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
