interface RadialGaugeProps {
  /** Porcentaje 0..100 del arco relleno (verde). */
  pct: number;
  /** Etiqueta centrada debajo del arco (ej. "Jul, 2026"). */
  centerLabel?: string;
  /** Alto del gauge en px. */
  height?: number;
  className?: string;
}

// Gauge semicircular del card "Auto-link Rate" (Figma 549:10149). Arco de 180° con `A` (arc) y
// `pathLength=100` para que el dasharray trabaje en porcentaje directo. Track gris + arco de valor
// con gradiente verde. El label central va como `<text>` SVG. Tamaños IDÉNTICOS en ambos temas;
// solo el color del track/label se adapta.
export function RadialGauge({ pct, centerLabel, height = 72, className }: RadialGaugeProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 42;
  const cx = 50;
  const cy = 50;
  const stroke = 9;
  // Semicírculo superior: del punto izquierdo al derecho, bulge hacia arriba (sweep=1).
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const viewH = cy + stroke; // deja aire para el linecap redondeado abajo

  return (
    <svg
      viewBox={`0 0 100 ${viewH}`}
      style={{ height }}
      className={className}
      role="img"
      aria-label={centerLabel ? `${clamped}% — ${centerLabel}` : `${clamped}%`}
    >
      <path
        d={arc}
        fill="none"
        pathLength={100}
        strokeWidth={stroke}
        strokeLinecap="round"
        className="stroke-neutral-200 dark:stroke-neutral-700"
      />
      <path
        d={arc}
        fill="none"
        pathLength={100}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${clamped} 100`}
        className="stroke-brand-green"
      />
      {centerLabel ? (
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-brand-forest text-[9px] font-semibold dark:fill-muted-foreground"
        >
          {centerLabel}
        </text>
      ) : null}
    </svg>
  );
}
