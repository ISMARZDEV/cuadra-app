import type { AdminCanonicalPriceHistoryDto } from "@cuadra/api-client";

import { formatMoney } from "@/features/save/lib/format";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { formatCatalogDate } from "../lib/format-date";

// Paleta por serie. Fija y en orden: que una tienda cambie de color entre rangos haría imposible
// seguirla de un vistazo.
// Márgenes del área de dibujo. Constante de módulo: no dependen de nada del render.
const PAD = { top: 16, right: 16, bottom: 28, left: 72 };

const SERIES_COLORS = [
  "#1c614e",
  "#bbec6c",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

interface PriceHistoryChartProps {
  history: AdminCanonicalPriceHistoryDto;
  /** Tiendas visibles; vacío = todas. */
  visible: Set<string>;
  onToggle: (providerId: string) => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

/**
 * Chart multi-tienda del histórico (US-CP-D7). SVG propio, sin librería de charts: son líneas
 * rectas entre puntos de cambio y traer una dependencia entera para eso sería peso muerto.
 *
 * Las series son ESCALONADAS a propósito (`stepAfter`): la tabla `price` es change-only, así que
 * entre dos puntos el precio NO se movió. Interpolar una diagonal dibujaría una subida gradual
 * que nunca ocurrió.
 */
export function PriceHistoryChart({
  history,
  visible,
  onToggle,
  t,
  locale,
}: PriceHistoryChartProps) {
  const series = history.series.filter(
    (s) => s.points.length > 0 && (visible.size === 0 || visible.has(s.provider_id)),
  );

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("admin.canonicalDetail.chart.empty")}
      </p>
    );
  }

  const times = allPoints.map((p) => new Date(p.captured_at).getTime());
  const prices = allPoints.map((p) => p.price_minor);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Todos los precios iguales (el caso MÁS común: una sola tienda que no cambió de precio) no
  // tiene rango vertical. Sin tratarlo aparte la línea queda pegada al borde inferior con 260px
  // de vacío arriba: se ve como un gráfico roto, no como "el precio está estable".
  const flat = maxPrice === minPrice;
  const W = 900;
  const H = flat ? 140 : 260;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // PISO DE ESCALA. Ajustar el eje a los extremos crudos convierte cualquier diferencia en un
  // desplome: con Bravo 474.00 · Nacional 474.95 · Sirena 475.00, un peso (0.2% del precio)
  // ocupaba los 260px de alto mientras el KPI de al lado decía "Variación del rango RD$0.00".
  // El gráfico y el número se contradecían, y el gráfico mentía. Ahora el dominio cubre al menos
  // un 6% del nivel de precio: una diferencia ínfima se ve ínfima, y una real sigue usando el
  // alto completo (`priceDomain` sólo se ensancha cuando el rango real no llega al piso).
  const MIN_SPAN_RATIO = 0.06;
  const midPrice = (minPrice + maxPrice) / 2;
  const minSpan = Math.max(Math.ceil(midPrice * MIN_SPAN_RATIO), 1);
  const rawSpan = maxPrice - minPrice;
  const domainMin = rawSpan >= minSpan ? minPrice : Math.round(midPrice - minSpan / 2);
  const domainMax = rawSpan >= minSpan ? maxPrice : Math.round(midPrice + minSpan / 2);

  const startLabel = formatCatalogDate(new Date(minTime).toISOString(), locale);
  const endLabel = formatCatalogDate(new Date(maxTime).toISOString(), locale);

  const timeSpan = maxTime - minTime || 1;
  const priceSpan = domainMax - domainMin || 1;
  const x = (iso: string) =>
    PAD.left + ((new Date(iso).getTime() - minTime) / timeSpan) * plotW;
  const y = (minor: number) =>
    flat
      ? PAD.top + plotH / 2 // centrada: la línea plana ES la información
      : PAD.top + plotH - ((minor - domainMin) / priceSpan) * plotH;

  // Una serie plana no necesita 5 líneas de grilla repitiendo el mismo número.
  const gridLines = flat ? 0 : 4;

  return (
    <div className="space-y-3">
      {/* Leyenda = selector: tocar una tienda la saca o la trae al chart (US-CP-D7). */}
      <div className="flex flex-wrap gap-2">
        {history.series.map((s, i) => {
          const on = visible.size === 0 || visible.has(s.provider_id);
          return (
            <button
              key={s.provider_id}
              type="button"
              onClick={() => onToggle(s.provider_id)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                on ? "border-transparent bg-muted" : "border-dashed border-border opacity-50",
              )}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.provider_name}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px]"
          style={{ height: H }}
          role="img"
          aria-label={t("admin.canonicalDetail.section.history")}
        >
          {Array.from({ length: gridLines + 1 }, (_, i) => {
            const value =
              gridLines === 0 ? minPrice : domainMin + ((domainMax - domainMin) * i) / gridLines;
            const gy = y(value);
            return (
              <g key={i}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={gy}
                  y2={gy}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={gy + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatMoney(Math.round(value), history.currency)}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const colorIndex = history.series.findIndex(
              (x2) => x2.provider_id === s.provider_id,
            );
            const color = SERIES_COLORS[colorIndex % SERIES_COLORS.length];
            // Escalonado: horizontal hasta el siguiente cambio, después el salto vertical.
            let d = "";
            s.points.forEach((p, i) => {
              const px = x(p.captured_at);
              const py = y(p.price_minor);
              if (i === 0) {
                d += `M ${px} ${py}`;
              } else {
                d += ` L ${px} ${y(s.points[i - 1].price_minor)} L ${px} ${py}`;
              }
            });
            // El último precio sigue vigente HASTA HOY: la línea llega al borde derecho.
            const last = s.points[s.points.length - 1];
            d += ` L ${W - PAD.right} ${y(last.price_minor)}`;

            return (
              <g key={s.provider_id}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} />
                {s.points.map((p, i) => (
                  <circle
                    key={`${p.captured_at}-${i}`}
                    cx={x(p.captured_at)}
                    cy={y(p.price_minor)}
                    r={3}
                    fill={color}
                  >
                    <title>
                      {`${s.provider_name} · ${formatMoney(p.price_minor, history.currency)} · ${formatCatalogDate(p.captured_at, locale)}`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* Con una sola fecha de captura, imprimir inicio y fin daba la misma fecha en los dos
              extremos y sugería un período que no existe. Una etiqueta centrada dice la verdad:
              todo lo que hay es de ese día. */}
          {startLabel === endLabel ? (
            <text
              x={PAD.left + plotW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {startLabel}
            </text>
          ) : (
            <>
              <text x={PAD.left} y={H - 8} className="fill-muted-foreground text-[11px]">
                {startLabel}
              </text>
              <text
                x={W - PAD.right}
                y={H - 8}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {endLabel}
              </text>
            </>
          )}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.canonicalDetail.chart.carryIn")}</p>
    </div>
  );
}
