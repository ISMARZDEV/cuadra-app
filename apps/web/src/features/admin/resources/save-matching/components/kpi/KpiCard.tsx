import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { KpiSentiment } from "../../lib/review-queue-kpis";

// Color del pill según el sentimiento. Reference (Figma): delta positivo = bg lima (#bbec6c =
// brand-lime) + texto teal oscuro (#034842 ≈ brand-forest). Solo el COLOR cambia entre temas; el
// tamaño/forma es el mismo.
const SENTIMENT_BADGE: Record<KpiSentiment, string> = {
  [KpiSentiment.Positive]: "bg-brand-lime text-brand-forest dark:bg-brand-lime/25 dark:text-brand-lime",
  [KpiSentiment.Negative]: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  [KpiSentiment.Neutral]: "bg-muted text-muted-foreground",
};

export interface KpiCardBadge {
  label: string;
  sentiment: KpiSentiment;
}

export interface KpiCardProps {
  /** Etiqueta superior (ej. "Cola Pendiente"). */
  title: string;
  /** Número/valor destacado ya formateado (ej. "221", "72%", "1.2d"). */
  value: string;
  /** Pill junto al valor: delta ("+12 productos") o etiqueta ("Canales activos"). */
  badge?: KpiCardBadge;
  /** Línea de contexto bajo el valor (ej. "Comparado con la semana pasada"). */
  subtitle: string;
  /** Slot del mini-chart (barras/gauge/línea/mix). */
  children: ReactNode;
  /** Marca el card como datos demo (placeholder hasta Fase 4) → muestra el chip honesto. */
  demo?: boolean;
  /** Texto del chip/tooltip demo (localizado). */
  demoLabel?: string;
  /** Etiqueta accesible del botón de menú (kebab). */
  menuLabel: string;
}

// Shell reutilizable de un KPI card de la cola de revisión — valores EXACTOS del Figma (número 40px
// teal, pill lima, título teal/subtítulo gris, kebab lima claro arriba-derecha). TODOS los tamaños,
// espaciados y tipografías son IDÉNTICOS en claro y oscuro; solo los colores se adaptan vía token.
export function KpiCard({ title, value, badge, subtitle, children, demo, demoLabel, menuLabel }: KpiCardProps) {
  return (
    <div className="relative flex min-w-0 flex-col rounded-[50px] border-[1.5px] border-border bg-card p-4 shadow-sm [corner-shape:squircle]">
      {/* Kebab: círculo lima claro en la esquina superior-derecha (Figma). */}
      <button
        type="button"
        aria-label={menuLabel}
        className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full border border-brand-lime/50 bg-brand-lime/40 text-brand-forest hover:bg-brand-lime/60 dark:text-brand-lime"
      >
        <MoreHorizontal className="size-2.5" />
      </button>

      <div className="flex items-center gap-1.5 pr-6">
        <h3 className="truncate text-[11px] font-semibold tracking-tight text-brand-forest dark:text-brand-lime">
          {title}
        </h3>
        {demo ? (
          <span
            className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-500/20 dark:text-amber-300"
            title={demoLabel}
          >
            demo
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-brand-forest tabular-nums dark:text-brand-lime">
          {value}
        </span>
        {badge ? (
          <span
            className={`rounded-full px-2 py-1 text-[13px] font-semibold whitespace-nowrap ${SENTIMENT_BADGE[badge.sentiment]}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p>

      <div className="mt-4">{children}</div>
    </div>
  );
}
