import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { KpiSentiment } from "./types";

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
  /** Slot del mini-chart (barras/gauge/línea/mix). OPCIONAL: un KPI sin serie histórica (p. ej. los
   * de Orquestación, que resumen la ÚLTIMA corrida) no tiene nada que graficar, y meterle un chart
   * inventado sería justo el dato falso que el plan maestro §1 prohíbe. */
  children?: ReactNode;
  /** Marca el card como datos demo (placeholder hasta Fase 4) → muestra el chip honesto. */
  demo?: boolean;
  /** Texto del chip/tooltip demo (localizado). */
  demoLabel?: string;
  /** Etiqueta accesible del botón de menú (kebab). */
  menuLabel: string;
  /** El `value` es una AUSENCIA (`—`), no una cifra. Se renderiza chico y apagado: un em-dash a
    * 40px se lee como una barra de censura, no como "no hay dato". */
  placeholder?: boolean;
  /** Variante compacta: reduce padding, tamaños de texto y charts. Solo para el hero del
    * detalle canónico — no afecta a la Cola de revisión ni a Orquestación. */
  compact?: boolean;
}

// Shell reutilizable de un KPI card de la cola de revisión — valores EXACTOS del Figma (número 40px
// teal, pill lima, título teal/subtítulo gris, kebab lima claro arriba-derecha). TODOS los tamaños,
// espaciados y tipografías son IDÉNTICOS en claro y oscuro; solo los colores se adaptan vía token.
export function KpiCard({
  title,
  value,
  badge,
  subtitle,
  children,
  demo,
  demoLabel,
  menuLabel,
  placeholder,
  compact,
}: KpiCardProps) {
  return (
    <div className={`relative flex h-full min-w-0 flex-col rounded-[50px] border-[1.5px] border-border bg-card shadow-sm [corner-shape:squircle] ${compact ? "p-3" : "p-4"}`}>
      {/* Kebab: círculo lima claro en la esquina superior-derecha (Figma). */}
      <button
        type="button"
        aria-label={menuLabel}
        className={`absolute flex items-center justify-center rounded-full border border-brand-lime/50 bg-brand-lime/40 text-brand-forest hover:bg-brand-lime/60 dark:text-brand-lime ${compact ? "top-2 right-2 size-3.5" : "top-3 right-3 size-4"}`}
      >
        <MoreHorizontal className={compact ? "size-2" : "size-2.5"} />
      </button>

      <div className={`flex items-center gap-1.5 ${compact ? "pr-4" : "pr-5"}`}>
        <h3 className={`truncate font-semibold tracking-tight text-brand-forest dark:text-brand-lime ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {title}
        </h3>
        {demo ? (
          <span
            className={`shrink-0 rounded-full bg-amber-100 px-1 py-px font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-500/20 dark:text-amber-300 ${compact ? "text-[8px]" : "text-[9px]"}`}
            title={demoLabel}
          >
            demo
          </span>
        ) : null}
      </div>

      <div className={`mt-1.5 flex items-center gap-1.5 ${compact ? "mt-1" : ""}`}>
        <span
          className={
            placeholder
              ? compact
                ? "text-[24px] leading-none font-semibold text-muted-foreground/50"
                : "text-[28px] leading-none font-semibold text-muted-foreground/50"
              : compact
                ? "text-[32px] leading-none font-semibold tracking-[-0.04em] text-brand-forest tabular-nums dark:text-brand-lime"
                : "text-[40px] leading-none font-semibold tracking-[-0.04em] text-brand-forest tabular-nums dark:text-brand-lime"
          }
        >
          {value}
        </span>
        {badge ? (
          <span
            className={`rounded-full font-semibold whitespace-nowrap ${SENTIMENT_BADGE[badge.sentiment]} ${compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[13px]"}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <p className={`truncate font-medium text-muted-foreground ${compact ? "mt-1 text-[10px]" : "mt-1.5 text-[11px]"}`}>{subtitle}</p>

      {children ? <div className={compact ? "mt-3" : "mt-4"}>{children}</div> : null}
    </div>
  );
}
