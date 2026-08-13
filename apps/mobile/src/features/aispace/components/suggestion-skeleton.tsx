import { Canvas, LinearGradient, RoundedRect, useClock, vec } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { useDerivedValue } from "react-native-reanimated";

// Píldoras fantasma con una luz que las recorre, mientras el catálogo resuelve qué sugerir. Es el
// mismo gesto que el «Pensando…» del chat, aplicado a la fila de sugerencias.
//
// POR QUÉ NO SE REUSA `ShimmerText`: ese componente recibe `text: string`, lo mide con métricas de
// fuente y pinta LOS GLÍFOS con el degradado. No tiene `children` y no envuelve una vista con
// fondo y borde. Además dibuja con la fuente del SISTEMA (`matchFont` sin `fontFamily`) mientras
// la píldora usa Kantumruy: para reusarlo sobre la etiqueta habría que registrar Kantumruy en el
// FontMgr de Skia, que nadie verificó. Acá no hay texto que dibujar, así que el problema no existe.
//
// UN SOLO Canvas para las tres píldoras, y no uno por píldora: un Canvas es un reloj, y tres
// relojes para una animación son tres veces el trabajo por el mismo resultado.
//
// ⚠️ REGLA DEL RELOJ (shimmer-text.tsx:25-30, aprendida a golpes en orb-sphere.tsx): `useClock`
// late mientras el componente esté MONTADO — ocultarlo por opacidad NO lo detiene. Este componente
// no se defiende solo: cuenta con que su padre lo DESMONTE (`{isResolving ? <Skeleton/> : …}`).
// Si alguna vez pasa a montarse siempre y alternarse por opacidad, necesita un guard explícito.

/** Anchos de las píldoras fantasma. Distintos a propósito: tres iguales se leen como una tabla,
 *  no como sugerencias. Imitan el largo de una frase corta, una media y una larga. */
const WIDTHS = [190, 150, 220];
const GAP = 8;
const INSET = 12;

/** Un barrido completo. El mismo que el shimmer del chat, para que se lean como un solo idioma. */
const PERIOD_MS = 1500;

export function SuggestionSkeleton({ height, radius }: { height: number; radius: number }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const base = isDark ? "#1A1A1D" : "#ECECEF";
  const highlight = isDark ? "#2E2E34" : "#FAFAFC";

  const clock = useClock();
  const total = INSET * 2 + WIDTHS.reduce((sum, w) => sum + w, 0) + GAP * (WIDTHS.length - 1);

  // La banda es más ancha que una píldora para que se lea como un barrido suave y no como un punto
  // que pasa; viaja desde fuera del borde izquierdo hasta fuera del derecho.
  const band = total * 0.4;
  const travel = total + band * 2;
  const startX = useDerivedValue(
    () => -band + ((clock.value % PERIOD_MS) / PERIOD_MS) * travel,
    [band, travel],
  );
  const gradientStart = useDerivedValue(() => vec(startX.value, 0), [startX]);
  const gradientEnd = useDerivedValue(() => vec(startX.value + band, 0), [startX, band]);

  return (
    <Canvas style={{ width: total, height: height + 16 }}>
      {WIDTHS.map((width, i) => (
        <RoundedRect
          key={width}
          x={INSET + WIDTHS.slice(0, i).reduce((sum, w) => sum + w + GAP, 0)}
          y={8}
          width={width}
          height={height}
          r={radius}
        >
          {/* El degradado se declara por rectángulo pero sus coordenadas son las MISMAS para todos
              (van en el espacio del canvas, no del rect): por eso la luz cruza la fila entera como
              una sola onda, en vez de repetirse dentro de cada píldora. */}
          <LinearGradient
            start={gradientStart}
            end={gradientEnd}
            colors={[base, highlight, base]}
            positions={[0, 0.5, 1]}
          />
        </RoundedRect>
      ))}
    </Canvas>
  );
}
