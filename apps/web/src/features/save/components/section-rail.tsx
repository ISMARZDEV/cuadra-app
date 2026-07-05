import type { ProductCardDto } from "@cuadra/api-client";

import { ProductRail } from "@/features/save/components/product-rail";

import type { Locale } from "@/i18n/config";

// Sección de rail de la home (Imagen #3): título + "ver todas" + <ProductRail> (carrusel Embla).
// El rail en sí vive en features/save/components/product-rail (compartido con el Overview de
// categoría). Si no hay productos, no renderiza nada (no mostramos secciones vacías).
export function SectionRail({
  title,
  products,
  locale,
  productHref,
  seeAll,
  seeAllHref,
}: {
  title: string;
  products: ProductCardDto[];
  locale: Locale;
  productHref: (slug: string) => string;
  seeAll?: string;
  seeAllHref?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {seeAll && seeAllHref && (
          <a href={seeAllHref} className="text-sm font-medium text-primary hover:underline">
            {seeAll}
          </a>
        )}
      </div>
      <ProductRail products={products} locale={locale} productHref={productHref} />
    </section>
  );
}
