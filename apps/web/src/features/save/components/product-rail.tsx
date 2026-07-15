import { ProductCard } from "@/features/save/components/product-card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import type { ProductRailProps } from "../interfaces";

// Carrusel Embla horizontal de ProductCards (Imagen #3): snap por ítem + flechas prev/next (solo
// desktop; en móvil se arrastra). Spacing shadcn: `-ml-4` en el Content + `pl-4`/`w-40` por ítem.
// Bloque COMPARTIDO por la home (SectionRail) y el Overview de categoría → una sola fuente de verdad.
export function ProductRail({ products, locale, productHref }: ProductRailProps) {
  return (
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
  );
}
