import type { ProductCardDto } from "@cuadra/api-client";

import type { Locale } from "../i18n/config";
import { ProductCard } from "./product-card";

// Rail horizontal de una sección de la home (Imagen #3): título + "ver todas" + carrusel de
// ProductCards reales. Si no hay productos, no renderiza nada (no muestra secciones vacías).
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
  productHref: (id: string) => string;
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
      <div className="flex gap-4 overflow-x-auto pb-2">
        {products.map((p) => (
          <div key={p.id} className="w-40 shrink-0">
            <ProductCard product={p} href={productHref(p.id)} locale={locale} />
          </div>
        ))}
      </div>
    </section>
  );
}
