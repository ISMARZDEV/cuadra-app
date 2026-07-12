import { confidenceStrokeClass } from "../../lib/confidence-color";
import type { ConfidenceDonutProps } from "./interfaces";

// Anillo circular de confianza del match (rediseño del detalle). SVG puro con `pathLength={100}` para
// que el `strokeDasharray` trabaje en porcentaje directo (misma técnica que `RadialGauge`, pero círculo
// COMPLETO — el gauge es semicircular y no sirve acá). Color del arco por banda vía
// `confidenceStrokeClass` (umbrales 0.85/0.55, fuente única con el backend). Coords enteras → sin
// precisión SVG de más. El `%` central es texto foreground (contraste garantizado en ambos temas — no
// dependemos solo del color del arco, regla a11y `color-not-only`).
export function ConfidenceDonut({
  confidence,
  size = 56,
  strokeWidth = 8,
  className,
}: ConfidenceDonutProps) {
  const pct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  const r = 50 - strokeWidth / 2; // el trazo se centra en r → extent máx = 50, cabe en viewBox 0..100

  return (
    <div
      role="img"
      aria-label={`Confianza del match ${pct}%`}
      className={`relative inline-grid shrink-0 place-items-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          pathLength={100}
          className="stroke-black/10 dark:stroke-white/15"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
          className={confidenceStrokeClass(confidence)}
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums text-foreground">{pct}%</span>
    </div>
  );
}
