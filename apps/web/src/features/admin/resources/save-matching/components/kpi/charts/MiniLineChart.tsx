import type { SeriesPoint } from "../../../lib/review-queue-kpis";

interface MiniLineChartProps {
  data: SeriesPoint[];
  /** Punto a destacar (dot + pill de anotación, ej. "+30%"). */
  highlight?: { index: number; label: string };
  height?: number;
  className?: string;
}

// Sparkline de línea+área del card "Tiempo en Cola" (Figma 549:10288). SVG puro con
// `vector-effect=non-scaling-stroke` para que el trazo de 2px NO se deforme al estirar el viewBox.
// La línea va verde hasta el punto destacado y gris después (la "cola" del Figma); el punto lleva un
// anillo del color del card y una píldora de anotación posicionada en HTML (fuera del SVG estirado).
// Tamaños IDÉNTICOS en ambos temas; solo el color se adapta.
export function MiniLineChart({ data, highlight, height = 56, className }: MiniLineChartProps) {
  const width = 100;
  const padY = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const span = Math.max(0.0001, max - min);

  const points = data.map((d, i) => {
    const x = data.length === 1 ? 0 : (i / (data.length - 1)) * width;
    const y = height - padY - ((d.value - min) / span) * (height - padY * 2);
    return { x, y };
  });

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const hi = highlight && points[highlight.index] ? points[highlight.index]! : null;
  const headPoints = hi ? points.slice(0, highlight!.index + 1) : points;
  const tailPoints = hi ? points.slice(highlight!.index) : [];

  const areaPath = `${toPath(points)} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className={`relative ${className ?? ""}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="size-full"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="queue-time-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bbec6c" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#bbec6c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#queue-time-area)" />
        <path
          d={toPath(headPoints)}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-brand-green"
        />
        {tailPoints.length > 1 ? (
          <path
            d={toPath(tailPoints)}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-neutral-300 dark:stroke-neutral-600"
          />
        ) : null}
      </svg>

      {hi ? (
        <>
          {/* Dot destacado (posición HTML sobre el SVG, en % → no se distorsiona). */}
          <span
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-brand-green"
            style={{ left: `${hi.x}%`, top: `${(hi.y / height) * 100}%` }}
            aria-hidden="true"
          />
          <span
            className="absolute -translate-x-1/2 translate-y-1 rounded-full bg-brand-forest px-1.5 py-0.5 text-[10px] font-semibold text-brand-lime"
            style={{ left: `${hi.x}%`, top: `${(hi.y / height) * 100}%` }}
          >
            {highlight!.label}
          </span>
        </>
      ) : null}
    </div>
  );
}
