import { Boxes } from "lucide-react";

import { PRODUCT_CARD_BG } from "@/features/admin/lib/product-surfaces";
import { cn } from "@/lib/utils";

/**
 * La foto de un producto, en tarjeta y CONTENIDA. El primitivo visual de toda imagen de producto
 * del OFV: la columna Imagen de las dos tablas, los dos detalles y las tarjetas de candidato.
 *
 * Por qué existe: las tiendas publican relaciones de aspecto muy distintas —Bravo manda lienzos
 * grandes con el producto chico adentro, otras mandan verticales— y `object-cover` recortaba justo
 * los extremos: el saco de arroz salía sin marca arriba ni gramaje abajo, que es lo único que el
 * operador mira para decidir si dos productos son el mismo.
 *
 * La TARJETA (fondo casi blanco + borde) no es decoración: las fotos ya vienen recortadas sobre
 * blanco, así que sin un contorno propio no se sabe dónde empieza y termina cada una.
 *
 * El TAMAÑO lo decide quien lo usa (48px en la tabla, 112px en el detalle); la tarjeta la decide
 * este componente, para que las cinco superficies no se desincronicen.
 */
export function ProductPhoto({
  src,
  alt,
  emptyLabel,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  /** Se ANUNCIA cuando no hay foto: que falte la imagen es trabajo pendiente, no un hueco mudo. */
  emptyLabel: string;
  /** Tamaño y radio — `size-12 rounded-lg`, `size-28 rounded-2xl`… */
  className?: string;
}) {
  if (!src) {
    return (
      <div
        data-testid="product-photo"
        role="img"
        aria-label={emptyLabel}
        title={emptyLabel}
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted",
          className,
        )}
      >
        <Boxes className="size-1/3 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      data-testid="product-photo"
      style={{ backgroundColor: PRODUCT_CARD_BG }}
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
    >
      <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
