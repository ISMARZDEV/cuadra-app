import { cn } from "@/lib/utils";

import { ProductPhoto } from "./ProductPhoto";

// Thumbnail del OFV con su contador encima: el par imagen + badge que usan el catálogo canónico
// (nº de tiendas enlazadas) y la Cola de revisión (nº de candidatos). Vive acá porque el operador
// salta entre las dos tablas todo el día y el mismo par tiene que verse igual en las dos.
//
// El badge va ABAJO a la derecha y no arriba: arriba pisaba la primera línea del nombre en las
// filas de dos líneas.
interface ThumbnailWithCountProps {
  src: string | null | undefined;
  alt: string;
  /** `null` = sin badge. `0` SÍ se pinta: "0 candidatos" es información, no ausencia de dato. */
  count: number | null;
  /** Texto anunciado cuando no hay imagen — nunca un div mudo. */
  emptyLabel: string;
  /** Sólo para no romper contratos de test ya existentes en quien lo llame. */
  countTestId?: string;
  /** Tamaño y radio del cuadrado. Default 48px — el de las tablas. */
  className?: string;
}

export function ThumbnailWithCount({
  src,
  alt,
  count,
  emptyLabel,
  countTestId,
  className,
}: ThumbnailWithCountProps) {
  return (
    <div className={cn("relative size-12 shrink-0", className)}>
      {/* La TARJETA la define `ProductPhoto` (una sola vez para las cinco superficies del OFV);
          acá sólo se le monta el contador encima. */}
      <ProductPhoto src={src} alt={alt} emptyLabel={emptyLabel} className="size-full" />
      {count != null ? (
        <span
          data-testid={countTestId}
          className="absolute -right-1 -bottom-1 flex size-5 min-w-5 items-center justify-center rounded-full bg-brand-forest px-1 text-[10px] font-bold text-brand-lime"
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}
