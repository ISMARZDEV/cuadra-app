import type { PriceHistoryDto } from "@cuadra/api-client";
import { useMemo, useState } from "react";

import type { Locale } from "../i18n/config";
import { translate } from "../i18n/messages";
import { formatMoney } from "../lib/format";
import {
  priceDomain,
  seriesInRange,
  stepVertices,
  windowStart,
  type HistoryRange,
} from "../lib/price-history";

// Historial de precios (C9) — área escalonada de UNA tienda a la vez (dropdown), con toggle de
// rango 1M/3M/Todos. Verde de marca (una sola serie → sin leyenda; el título/dropdown la nombra).
// `nowMs` llega estable desde el servidor (evita mismatch de hidratación en los ejes de fecha).

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const RANGES: HistoryRange[] = ["1m", "3m", "all"];
const RANGE_KEY = {
  "1m": "history.range1m",
  "3m": "history.range3m",
  all: "history.rangeAll",
} as const;

export function PriceHistoryChart({
  history,
  locale,
  nowMs,
}: {
  history: PriceHistoryDto;
  locale: Locale;
  nowMs: number;
}) {
  const series = history.series;
  const [range, setRange] = useState<HistoryRange>("3m");
  const [providerId, setProviderId] = useState<string>(series[0]?.provider_id ?? "");

  const active = series.find((s) => s.provider_id === providerId) ?? series[0];

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const chart = useMemo(() => {
    if (!active) return null;
    const pts = seriesInRange(active.points, range, now);
    if (pts.length === 0) return null;
    const [dMin, dMax] = priceDomain(pts);
    const end = nowMs;

    // Inicio del eje X: el de la ventana (1m/3m) o el primer cambio (all). Garantiza un ancho
    // mínimo de 1 día para que una serie de un solo punto no se aplaste en una astilla.
    const MIN_SPAN = 24 * 60 * 60 * 1000;
    let start = windowStart(range, now)?.getTime() ?? Date.parse(pts[0].captured_at);
    if (end - start < MIN_SPAN) start = end - MIN_SPAN;
    const span = Math.max(1, end - start);

    const vertices = stepVertices(pts, nowMs);
    // Extiende el primer precio conocido hasta el inicio de la ventana → línea plana a lo ancho
    // cuando el precio ha sido estable (convención de charts de precio, no inventa un cambio).
    if (vertices[0].ms > start) vertices.unshift({ ms: start, price: vertices[0].price });

    const x = (ms: number) => PAD.left + ((ms - start) / span) * PLOT_W;
    const y = (price: number) =>
      PAD.top + PLOT_H - ((price - dMin) / Math.max(1, dMax - dMin)) * PLOT_H;

    const line = vertices.map((v, i) => `${i === 0 ? "M" : "L"}${x(v.ms).toFixed(1)},${y(v.price).toFixed(1)}`).join(" ");
    const areaBase = PAD.top + PLOT_H;
    const area = `${line} L${x(vertices[vertices.length - 1].ms).toFixed(1)},${areaBase} L${x(vertices[0].ms).toFixed(1)},${areaBase} Z`;

    return { vertices, dMin, dMax, start, end, line, area, x, y };
  }, [active, range, now, nowMs]);

  if (!active || !chart) {
    return <p className="text-sm text-muted-foreground">{translate(locale, "history.empty")}</p>;
  }

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(ms));

  return (
    <div>
      {/* Controles: dropdown de tienda (der.) */}
      <div className="mb-3 flex items-center justify-end">
        {series.length > 1 && (
          <select
            aria-label={translate(locale, "history.byStore")}
            value={active.provider_id}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          >
            {series.map((s) => (
              <option key={s.provider_id} value={s.provider_id}>
                {s.provider_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${translate(locale, "product.history")} — ${active.provider_name}`}
        preserveAspectRatio="none"
      >
        {/* rejilla recesiva: min/max de precio */}
        {[chart.dMax, chart.dMin].map((p) => (
          <g key={p}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={chart.y(p)}
              y2={chart.y(p)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={chart.y(p) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
              {formatMoney(p, history.currency)}
            </text>
          </g>
        ))}

        {/* área + línea (verde de marca) */}
        <path d={chart.area} fill="var(--primary)" fillOpacity={0.12} />
        <path d={chart.line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />

        {/* ejes de fecha (extremos) */}
        <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--muted-foreground)">
          {fmtDate(chart.start)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
          {fmtDate(chart.end)}
        </text>
      </svg>

      {/* toggle de rango */}
      <div className="mt-3 flex justify-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={
              range === r
                ? "rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground hover:border-primary"
            }
          >
            {translate(locale, RANGE_KEY[r])}
          </button>
        ))}
      </div>
    </div>
  );
}
