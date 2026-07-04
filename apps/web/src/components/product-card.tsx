import type { ProductCardDto } from "@cuadra/api-client";

import type { Locale } from "../i18n/config";
import { translate } from "../i18n/messages";
import { formatMoney, formatUnitPrice } from "../lib/format";
import { Card } from "./ui/card";

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
  return (
    <a href={href} className="group block">
      <Card className="h-full p-3 transition-colors group-hover:border-primary">
        <div className="relative">
          <div className="aspect-square rounded-md bg-muted" aria-hidden />
          <span
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground"
            aria-hidden
          >
            +
          </span>
        </div>
        <div className="mt-2 space-y-0.5">
          {product.brand && (
            <p className="text-xs text-muted-foreground">{product.brand}</p>
          )}
          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
          <p className="pt-0.5 font-bold">{formatMoney(product.price_minor, product.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {formatUnitPrice(product.unit_price_minor, product.currency, product.unit_measure)}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.store_count} {translate(locale, "product.stores")}
          </p>
        </div>
      </Card>
    </a>
  );
}
