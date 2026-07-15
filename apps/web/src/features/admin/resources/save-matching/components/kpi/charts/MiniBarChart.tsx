import type { SeriesPoint } from "../../../lib/review-queue-kpis";

interface MiniBarChartProps {
  data: SeriesPoint[];
  /** Alto del área de dibujo en px (los KPI charts comparten ~56px, ver `KpiCard`). */
  height?: number;
  className?: string;
}

// Sparkline de barras del card "Cola Pendiente" (Figma 549:10100). Se dibuja con divs HTML (NO SVG
// con `preserveAspectRatio=none`, que estira y deforma los bordes redondeados). Cada barra: ancho
// fijo, tope y base redondeados, color sólido SIN borde, alto proporcional al máximo. Dos tonos
// alternados (lima brand-green + verde forest). El COLOR se adapta al tema con clases estáticas; el
// tamaño es el mismo en ambos temas.
export function MiniBarChart({ data, height = 56, className }: MiniBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div
      className={`flex items-end justify-center gap-5 ${className ?? ""}`}
      style={{ height }}
      role="img"
      aria-hidden="true"
    >
      {data.map((d, i) => {
        const barHeight = Math.max(4, Math.round((d.value / max) * height));
        // Clases estáticas (no interpoladas): el verde forest es muy oscuro sobre el card oscuro →
        // en dark se aclara a emerald-500.
        const color = i % 2 === 0 ? "bg-brand-green" : "bg-brand-forest dark:bg-emerald-500";
        return (
          <div
            key={d.label + i}
            className={`w-5 shrink-0 rounded-[4px] ${color}`}
            style={{ height: barHeight }}
            title={`${d.label}: ${d.value}`}
          />
        );
      })}
    </div>
  );
}
