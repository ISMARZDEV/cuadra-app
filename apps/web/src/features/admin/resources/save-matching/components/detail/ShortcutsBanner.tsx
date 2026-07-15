import type { ShortcutsBannerProps } from "./interfaces";

// Atajos del revisor. Cada uno es un BOTÓN clickeable (no solo texto) que dispara la MISMA acción que
// la tecla (`useKeyboardReview`) — así funciona con teclado o con mouse/touch. Las etiquetas describen
// el efecto real: a=aprobar el mejor candidato, r=ir al flujo de rechazo, n=siguiente match pendiente.
// Aprobar/rechazar llevan el modificador Option (⌥) — acciones consecuentes; navegar (P/N) va sin
// modificador. Los chips reflejan las teclas reales.
const SHORTCUTS = [
  { keys: ["⌥", "A"], label: "Aprobar mejor candidato", action: "onApprove", aria: "Alt+A" },
  { keys: ["⌥", "R"], label: "Rechazar match", action: "onReject", aria: "Alt+R" },
  { keys: ["P"], label: "Match anterior", action: "onPrev", aria: "P" },
  { keys: ["N"], label: "Siguiente match", action: "onNext", aria: "N" },
] as const;

export function ShortcutsBanner({
  onApprove,
  onReject,
  onNext,
  onPrev,
  disabled,
}: ShortcutsBannerProps) {
  const handlers = { onApprove, onReject, onNext, onPrev };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-muted/40 p-3 dark:border-white/10">
      <span className="text-[11px] font-semibold text-muted-foreground">Atajos de teclado</span>
      <div className="flex flex-wrap gap-1">
        {SHORTCUTS.map((s) => (
          <button
            key={s.aria}
            type="button"
            disabled={disabled}
            onClick={handlers[s.action]}
            aria-keyshortcuts={s.aria}
            className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-brand-forest/40 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex items-center gap-0.5">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-black/10 bg-card px-1 text-xs font-bold text-foreground shadow-sm transition-colors group-hover:border-brand-forest/40 group-hover:text-brand-forest dark:border-white/15 dark:group-hover:text-brand-lime"
                >
                  {k}
                </kbd>
              ))}
            </span>
            <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
