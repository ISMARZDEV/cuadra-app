import type { ProductCardDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";
import { formatMoney, formatUnitPriceDisplay } from "@/features/save/lib/format";
import { useShoppingList } from "@/features/save/hooks/use-shopping-list";
import { Card } from "@/components/ui/card";

// Card de producto (Imagen #5, §B): imagen (placeholder hasta persistir image_url), marca, nombre,
// precio del MÁS BARATO, precio/unidad y "N tiendas". Presentacional puro (recibe locale + href).
// El botón "+" (agregar a lista) es placeholder hasta el slice de lista.
export function ProductCard({
  product,
  href,
  locale,
}: {
  product: ProductCardDto;
  href: string;
  locale: Locale;
}) {
  const { add } = useShoppingList();
  const addToCart = (e: React.MouseEvent) => {
    e.preventDefault(); // el "+" no navega al producto
    e.stopPropagation();
    add({
      id: product.id,
      name: product.name,
      brand: product.brand,
      image_url: product.image_url ?? null,
      price_minor: product.price_minor,
      currency: product.currency,
      qty: 1,
    });
  };

  return (
    <a href={href} className="group block">
      <Card className="h-full p-3 transition-colors group-hover:border-primary">
        <div className="relative">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="aspect-square w-full rounded-md object-contain"
            />
          ) : (
            <div className="aspect-square rounded-md bg-muted" aria-hidden />
          )}
          {product.display_size && (
            <span className="absolute bottom-1 left-1 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[11px] font-medium text-background">
              {product.display_size}
            </span>
          )}
          {product.discount_bps != null && product.discount_bps > 0 && (
            <span className="absolute left-1 top-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
              −{Math.round(product.discount_bps / 100)}%
            </span>
          )}
          <button
            type="button"
            onClick={addToCart}
            aria-label={translate(locale, "product.addToList")}
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground transition hover:brightness-110"
          >
            +
          </button>
        </div>
        <div className="mt-2 space-y-0.5">
          {product.brand && (
            <p className="text-xs text-muted-foreground">{product.brand}</p>
          )}
          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
          <p className="pt-0.5 font-bold">{formatMoney(product.price_minor, product.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {formatUnitPriceDisplay(
              product.price_minor,
              product.currency,
              product.display_size,
              product.unit_price_minor,
              product.unit_measure,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.store_count} {translate(locale, "product.stores")}
          </p>
        </div>
      </Card>
    </a>
  );
}
