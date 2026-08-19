import { Canvas, LinearGradient, RoundedRect, useClock, vec } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { useDerivedValue } from "react-native-reanimated";

import { cardPalette } from "@/components/ui/basket-product-card";

// Formas fantasma con una luz que las recorre, mientras Save resuelve qué enseñar.
//
// Es la misma pieza que el esqueleto de las sugerencias del chat (`suggestion-skeleton.tsx`),
// generalizada: aquélla tenía las tres píldoras metidas en el código, y acá hacen falta rejillas,
// rails y círculos. El barrido, el período y la paleta se conservan, porque un esqueleto que
// parpadea distinto en cada pantalla se lee como otra app.
//
// UN SOLO Canvas para TODAS las formas, y no uno por forma: un Canvas es un reloj, y veinte relojes
// para una animación son veinte veces el trabajo por el mismo resultado.
//
// ⚠️ REGLA DEL RELOJ (heredada de `shimmer-text.tsx`, aprendida a golpes en `orb-sphere.tsx`):
// `useClock` late mientras el componente esté MONTADO — ocultarlo por opacidad NO lo detiene. Este
// componente no se defiende solo: cuenta con que su padre lo DESMONTE
// (`{cargando ? <Skeleton/> : <Contenido/>}`). Si alguna vez pasa a montarse siempre y alternarse
// por opacidad, necesita un guard explícito.

/** Un barrido completo. El mismo que el shimmer del chat, para que se lean como un solo idioma. */
const PERIOD_MS = 1500;

export interface ShimmerShape {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radio de las esquinas. Para un círculo, la mitad del lado. */
  radius: number;
}

interface ShimmerSkeletonProps {
  shapes: readonly ShimmerShape[];
  width: number;
  height: number;
  /**
   * Paleta a medida. Por defecto, los grises de esqueleto de la app; se sobreescriben cuando las
   * formas caen sobre una superficie que no es el fondo —el verde del header, por ejemplo—, donde
   * un gris neutro se leería como suciedad en vez de como un hueco por llenar.
   */
  base?: string;
  highlight?: string;
}

export function ShimmerSkeleton({
  shapes,
  width,
  height,
  base,
  highlight,
}: ShimmerSkeletonProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // EL HUECO SE PINTA DEL COLOR DE LA TARJETA, no de un gris de esqueleto genérico: lo que va a
  // llegar ahí es una tarjeta, así que el fantasma es LA MISMA superficie —blanca en claro, `#151515`
  // en oscuro— y al llegar el contenido sólo se rellena, no cambia de color. Sale de `cardPalette`,
  // que es la única fuente de esos dos valores.
  const fill = base ?? cardPalette(isDark ? "dark" : "light").shell;
  // Sobre una superficie ya clara la luz no puede ser MÁS clara: el barrido va hacia el otro lado,
  // una sombra suave que cruza. En oscuro sí aclara, que es donde se lee.
  const light = highlight ?? (isDark ? "#242424" : "#EFEFF2");

  const clock = useClock();

  // La banda es más ancha que una forma para que se lea como un barrido suave y no como un punto
  // que pasa; viaja desde fuera del borde izquierdo hasta fuera del derecho.
  const band = width * 0.4;
  const travel = width + band * 2;
  const startX = useDerivedValue(
    () => -band + ((clock.value % PERIOD_MS) / PERIOD_MS) * travel,
    [band, travel],
  );
  const gradientStart = useDerivedValue(() => vec(startX.value, 0), [startX]);
  const gradientEnd = useDerivedValue(() => vec(startX.value + band, 0), [startX, band]);

  return (
    <Canvas style={{ width, height }}>
      {shapes.map((shape, i) => (
        <RoundedRect
          // Las formas son posiciones, no datos: no tienen identidad propia y el índice es la clave
          // honesta. La lista tampoco se reordena — se calcula entera en cada render.
          key={i}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          r={shape.radius}
        >
          {/* El degradado se declara por forma pero sus coordenadas son las MISMAS para todas (van
              en el espacio del canvas, no del rect): por eso la luz cruza el bloque entero como una
              sola onda, en vez de repetirse dentro de cada forma. */}
          <LinearGradient
            start={gradientStart}
            end={gradientEnd}
            colors={[fill, light, fill]}
            positions={[0, 0.5, 1]}
          />
        </RoundedRect>
      ))}
    </Canvas>
  );
}
