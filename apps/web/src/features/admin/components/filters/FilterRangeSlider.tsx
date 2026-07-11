import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface FilterRangeSliderProps {
  /** Rango actual `[min, max]` en las mismas unidades que `min`/`max` (por defecto 0–100). */
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  minLabel: string;
  maxLabel: string;
  /** Marcas bajo el slider (p.ej. [0, 25, 50, 75, 100]). Opcional. */
  ticks?: number[];
  className?: string;
}

/**
 * Slider de rango (doble handle) + inputs numéricos min/máx + marcas, dentro de un panel suave.
 * Reutilizable para cualquier filtro numérico acotado (confianza, precio, peso…). Mantiene
 * `min ≤ max` al editar cualquiera de los dos extremos.
 */
export function FilterRangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  minLabel,
  maxLabel,
  ticks,
  className,
}: FilterRangeSliderProps) {
  const [lo, hi] = value;

  function setLo(next: number) {
    const clamped = Math.min(Math.max(next, min), hi);
    onChange([clamped, hi]);
  }
  function setHi(next: number) {
    const clamped = Math.max(Math.min(next, max), lo);
    onChange([lo, clamped]);
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl bg-muted/50 p-4 [corner-shape:squircle] dark:bg-white/5",
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>

      <div className="flex items-center gap-3">
        <RangeNumber value={lo} min={min} max={hi} onCommit={setLo} aria-label={minLabel} />
        <Slider
          value={[lo, hi]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange([v[0], v[1]] as [number, number])}
          className="flex-1 [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-background [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:shadow-md"
        />
        <RangeNumber value={hi} min={lo} max={max} onCommit={setHi} aria-label={maxLabel} />
      </div>

      {ticks && ticks.length > 0 ? (
        <div className="flex justify-between px-[2px] text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RangeNumber({
  value,
  min,
  max,
  onCommit,
  ...aria
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onCommit(n);
      }}
      className="h-11 w-16 shrink-0 rounded-xl border border-border bg-background text-center text-sm font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [corner-shape:squircle]"
      {...aria}
    />
  );
}
