import { ChevronLeft, ChevronRight } from "lucide-react";

import type { QueuePagerProps } from "./interfaces";

// Pager de posición en la cola: "← N / total →". Muestra dónde estás y navega al match anterior/
// siguiente. Los botones se deshabilitan en los extremos (sin anterior/siguiente). "—" si la posición
// no se pudo determinar (match fuera de la primera página del SSR).
export function QueuePager({
  position,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  disabled,
}: QueuePagerProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-black/5 bg-card p-1 shadow-sm dark:border-white/10">
      <button
        type="button"
        aria-label="Match anterior"
        disabled={disabled || !hasPrev}
        onClick={onPrev}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-forest/40 disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <span className="px-2 text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
        {position ?? "—"} <span className="font-normal text-muted-foreground">/ {total}</span>
      </span>
      <button
        type="button"
        aria-label="Siguiente match"
        disabled={disabled || !hasNext}
        onClick={onNext}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-forest/40 disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
