import type { PriceComparisonDto } from "@cuadra/api-client";

import { formatMoney } from "../lib/format";

// Tabla comparativa (C4): tiendas ordenadas por precio (el backend ya las ordena), "Mejor precio"
// en la más barata y "+RD$X" en el resto. Presentacional puro → testeable sin red.
export function CompareTable({ comparison }: { comparison: PriceComparisonDto }) {
  return (
    <table className="compare">
      <thead>
        <tr>
          <th>Supermercado</th>
          <th>Precio</th>
          <th>vs. mejor</th>
        </tr>
      </thead>
      <tbody>
        {comparison.entries.map((entry) => (
          <tr key={entry.provider_id} className={entry.is_cheapest ? "cheapest" : ""}>
            <td>{entry.provider_name}</td>
            <td>{formatMoney(entry.price_minor, entry.currency)}</td>
            <td>
              {entry.is_cheapest
                ? "Mejor precio"
                : `+${formatMoney(entry.extra_minor, entry.currency)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
