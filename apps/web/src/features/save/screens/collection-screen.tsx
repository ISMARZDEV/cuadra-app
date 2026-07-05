import { useData } from "vike-react/useData";

import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { Breadcrumbs } from "../components/breadcrumbs";
import { ProductCard } from "../components/product-card";
import type { CollectionData } from "../types";

// Página propia de una colección curada (A6): nombre + todos sus productos hand-pick (grilla).
export function CollectionScreen() {
  const { locale, country, t } = usePageI18n();
  const { name, products } = useData<CollectionData>();
  const productHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${slug}`);

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
            <ProductCard key={p.id} product={p} href={productHref(p.slug)} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
