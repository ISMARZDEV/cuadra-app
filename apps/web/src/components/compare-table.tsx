import type { PriceComparisonDto } from "@cuadra/api-client";

import type { Locale } from "../i18n/config";
import { translate } from "../i18n/messages";
import { formatMoney } from "../lib/format";

// Tabla comparativa (C4): tiendas ordenadas por precio (el backend ya las ordena), "Mejor precio"
// en la más barata y "+RD$X" en el resto. Presentacional puro (recibe locale) → testeable sin red
// ni contexto de Vike.
export function CompareTable({
  comparison,
  locale,
}: {
  comparison: PriceComparisonDto;
  locale: Locale;
}) {
  return (
    <table className="compare">
      <thead>
        <tr>
          <th>{translate(locale, "compare.store")}</th>
          <th>{translate(locale, "compare.price")}</th>
          <th>{translate(locale, "compare.vsBest")}</th>
        </tr>
      </thead>
      <tbody>
        {comparison.entries.map((entry) => (
          <tr key={entry.provider_id} className={entry.is_cheapest ? "cheapest" : ""}>
            <td>{entry.provider_name}</td>
            <td>{formatMoney(entry.price_minor, entry.currency)}</td>
            <td>
              {entry.is_cheapest
                ? translate(locale, "compare.best")
                : `+${formatMoney(entry.extra_minor, entry.currency)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
