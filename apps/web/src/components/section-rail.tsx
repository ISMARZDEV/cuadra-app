import type { ProductCardDto } from "@cuadra/api-client";

import type { Locale } from "../i18n/config";
import { ProductCard } from "./product-card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel";

// Rail horizontal de una sección de la home (Imagen #3): título + "ver todas" + carrusel Embla de
// ProductCards reales. Snap por ítem + flechas prev/next (solo desktop; en móvil se arrastra).
// Spacing shadcn: `-ml-4` en CarouselContent + `pl-4` en cada CarouselItem. Si no hay productos, no
// renderiza nada (no mostramos secciones vacías).
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
      <Carousel opts={{ align: "start", dragFree: true }} className="w-full">
        <CarouselContent className="-ml-4">
          {products.map((p) => (
            <CarouselItem key={p.id} className="basis-auto pl-4">
              <div className="w-40">
                <ProductCard product={p} href={productHref(p.slug)} locale={locale} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2 hidden sm:flex" />
        <CarouselNext className="right-2 hidden sm:flex" />
      </Carousel>
    </section>
  );
}
