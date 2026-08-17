import { View } from "react-native";

import { CARD_WIDTH } from "@/components/ui/basket-product-card";

import { ShimmerSkeleton } from "../../components/shimmer-skeleton";
import { arcSkeletonShapes, gridSkeletonShapes, railSkeletonShapes } from "../skeleton-layout";

// Los esqueletos de Supermarket: el hueco que se enseña mientras cargan los datos, con la luz del
// shimmer recorriéndolo. La forma sale de `skeleton-layout`, que es donde está probado que ocupan
// el sitio exacto del contenido que van a sustituir.
//
// ⚠️ Estos componentes se DESMONTAN al llegar los datos, no se ocultan: el reloj de Skia late
// mientras el componente esté montado, y esconderlo por opacidad lo dejaría corriendo para siempre.
// Ver la nota del reloj en `shimmer-skeleton.tsx`.

/** Separación entre los dos rails fantasma. La misma que entre los rails de verdad. */
const RAIL_GAP = 28;

/**
 * Los círculos de la ruleta mientras llegan las categorías.
 *
 * Sin paleta propia: usa la MISMA superficie que los demás esqueletos de Save. Se probó a teñirlos
 * de verde para que se fundieran con el header y era peor — un hueco tiene que leerse como un
 * hueco, y sobre el verde ese verde más claro parecía una mancha. Blanco recortado contra el verde
 * dice «acá va a haber algo», que es todo el trabajo de un esqueleto.
 */
export function ArcSkeleton({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }}>
      <ShimmerSkeleton
        shapes={arcSkeletonShapes(width)}
        width={width}
        height={height}
      />
    </View>
  );
}

/** Los dos rails de producto de la home mientras cargan. */
export function RailsSkeleton({ width, gutter }: { width: number; gutter: number }) {
  const rail = railSkeletonShapes({ width, gutter, cardWidth: CARD_WIDTH, gap: 5 });
  return (
    <View pointerEvents="none" style={{ gap: RAIL_GAP }}>
      {/* Dos bloques y no uno de doble alto: cada rail es su propia unidad, y con un solo bloque la
          luz cruzaría los dos a la vez como si fueran una sola pieza. */}
      <ShimmerSkeleton shapes={rail.shapes} width={width} height={rail.height} />
      <ShimmerSkeleton shapes={rail.shapes} width={width} height={rail.height} />
    </View>
  );
}

/** La rejilla de «Categorías» mientras carga. */
export function GridSkeleton({
  width,
  gutter,
  cardWidth,
  columnGap,
  rowGap,
  rows,
}: {
  width: number;
  gutter: number;
  cardWidth: number;
  columnGap: number;
  rowGap: number;
  rows: number;
}) {
  const grid = gridSkeletonShapes({ gutter, columns: 3, columnGap, rowGap, cardWidth, rows });
  return (
    <View pointerEvents="none">
      <ShimmerSkeleton shapes={grid.shapes} width={width} height={grid.height} />
    </View>
  );
}
