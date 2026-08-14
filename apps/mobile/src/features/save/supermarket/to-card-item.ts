import type { ProductCardDto } from "@cuadra/api-client";

import type { ProductListItemData } from "@/components/ui/basket-product-card";
import { formatMoney } from "@/lib/money";

// Traduce el DTO del catálogo a lo que la TARJETA sabe pintar. Es una función pura y vive aparte
// del componente a propósito: es la única pieza de todo el carrusel que se puede probar de verdad
// bajo jsdom (el layout y el gesto no), y es donde se concentran las decisiones que se pueden
// equivocar en silencio.
//
// El dinero llega SIEMPRE en minor units y se formatea acá — regla sagrada de Save: nunca floats
// para dinero, y el formateo es responsabilidad exclusiva de la UI.

export interface CardItemView {
  item: ProductListItemData;
  currency: string;
  /** En cuántas tiendas está — el número del círculo en esta pantalla. */
  badge: number;
  discountBps: number | null;
  /** Ya formateado; `null` cuando el producto no está en oferta. */
  previousPrice: string | null;
}

export function toCardItemView(dto: ProductCardDto, index: number): CardItemView {
  return {
    item: {
      // La posición se sigue mandando porque el tipo la exige, pero en esta pantalla NO se pinta:
      // el círculo muestra `badge`. Se deja 1-based por si algún día vuelve a usarse.
      index: index + 1,
      canonical_product_id: dto.id,
      name: dto.name,
      brand: dto.brand,
      // `display_size` es el tamaño tal como lo muestra el catálogo ("2.0 kg"). De él sale también
      // la línea «X kg» de abajo, que la tarjeta deriva sola.
      size: dto.display_size ?? null,
      image_url: dto.image_url ?? null,
      // Sin URL de tienda: en esta pantalla la esquina la ocupa el marcador, no el ojo.
      url: null,
      unit_price: formatMoney(dto.price_minor, dto.currency),
    },
    currency: dto.currency,
    badge: dto.store_count,
    discountBps: dto.discount_bps ?? null,
    previousPrice:
      dto.previous_price_minor != null
        ? formatMoney(dto.previous_price_minor, dto.currency)
        : null,
  };
}
