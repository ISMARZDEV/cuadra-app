import { METHOD_SHORT_LABEL, METHOD_VISUALS } from "../../../lib/method-palette";
import type { MethodShare } from "../../../lib/review-queue-kpis";

interface MethodShareChartProps {
  shares: MethodShare[];
  className?: string;
}

// Mix de métodos del card "Métodos de Match" (Figma 549:10192): por método, una barra DOS-TONOS —
// track pastel + relleno saturado cuyo ancho = el % directo (0..100). Los dos colores por método
// vienen de `METHOD_VISUALS` (fuente única). Código corto del Figma (Hybrid/LLM/…) como etiqueta.
// Tamaños/tipografía IDÉNTICOS en ambos temas.
export function MethodShareChart({ shares, className }: MethodShareChartProps) {
  return (
    <div className={`grid grid-flow-col grid-rows-3 gap-x-4 gap-y-3 ${className ?? ""}`}>
      {shares.map(({ method, pct }) => {
        const visual = METHOD_VISUALS[method];
        return (
          <div key={method} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-12 shrink-0 truncate font-bold text-brand-forest dark:text-brand-lime">
              {METHOD_SHORT_LABEL[method]}
            </span>
            <span
              className="h-[18px] flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: visual.pastel }}
            >
              <span
                className="block h-full"
                style={{ width: `${Math.min(100, pct)}%`, backgroundColor: visual.strong }}
              />
            </span>
            <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-brand-forest dark:text-brand-lime">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
