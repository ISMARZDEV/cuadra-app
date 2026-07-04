import type { PriceComparisonDto } from "@cuadra/api-client";
import { ArrowUpRight } from "lucide-react";

import type { Locale } from "../i18n/config";
import { translate } from "../i18n/messages";
import { formatMoney, formatUnitPriceDisplay } from "../lib/format";

// Color estable por tienda para el avatar (mientras no haya logos reales — F2/assets).
const AVATAR_COLORS = [
  "bg-emerald-600", "bg-sky-600", "bg-amber-600", "bg-rose-600",
  "bg-violet-600", "bg-teal-600", "bg-orange-600", "bg-indigo-600",
];
function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Tabla comparativa (C4): una fila-card por tienda, ordenadas por precio (el backend ya las ordena).
// La más barata resaltada ("Mejor precio"); el resto "+RD$X más caro". Precio por unidad ORIGINAL
// (por LB, no kg). Botón "Ir a tienda" si hay URL. Presentacional puro (recibe locale) → testeable.
export function CompareTable({
  comparison,
  locale,
}: {
  comparison: PriceComparisonDto;
  locale: Locale;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {comparison.entries.map((entry) => (
        <li
          key={entry.provider_id}
          className={`flex items-center gap-3 px-4 py-3 ${
            entry.is_cheapest ? "bg-primary/5" : "bg-card"
          }`}
        >
          {/* Tienda: avatar con inicial + nombre */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(
                entry.provider_name,
              )}`}
              aria-hidden
            >
              {entry.provider_name.charAt(0)}
            </span>
            <span className="truncate text-sm font-medium">{entry.provider_name}</span>
          </div>

          {/* Precio + precio/unidad */}
          <div className="text-right">
            <p className="font-bold tabular-nums">
              {formatMoney(entry.price_minor, entry.currency)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatUnitPriceDisplay(
                entry.price_minor,
                entry.currency,
                comparison.display_size,
                entry.unit_price_minor,
                entry.unit_measure,
              )}
            </p>
          </div>

          {/* vs. mejor */}
          <div className="hidden w-28 text-right text-xs sm:block">
            {entry.is_cheapest ? (
              <span className="font-semibold text-primary">{translate(locale, "compare.best")}</span>
            ) : (
              <span className="text-muted-foreground">
                +{formatMoney(entry.extra_minor, entry.currency)}
              </span>
            )}
          </div>

          {/* Ir a tienda */}
          <a
            href={entry.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!entry.url}
            className={`flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary ${
              entry.url ? "" : "pointer-events-none opacity-40"
            }`}
          >
            {translate(locale, "compare.goToStore")}
            <ArrowUpRight className="size-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
