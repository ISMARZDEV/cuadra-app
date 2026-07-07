import type { AdminReviewQueueRowDto } from "@cuadra/api-client";

import { confidenceColor } from "../lib/confidence-color";

interface ReviewRowProps {
  row: AdminReviewQueueRowDto;
  href: string;
  /** Selección para bulk-actions (batch 2e, 2.23/2.24) — omitido/`undefined` = sin checkbox
   * (mantiene el componente usable sin bulk, aunque hoy la lista siempre lo pasa). */
  selected?: boolean;
  onToggleSelect?: (matchId: string) => void;
}

// Fila de la cola de revisión (feature #8, F2·B1): confianza SIEMPRE color-coded (nunca un número
// pelado — `confidenceColor` es la fuente de verdad, mirrorea los umbrales del backend) + link al
// detalle (`/admin/review-queue/{match_id}`, la página destino la construye el batch siguiente).
export function ReviewRow({ row, href, selected = false, onToggleSelect }: ReviewRowProps) {
  return (
    <tr className="border-b border-border text-sm">
      {onToggleSelect ? (
        <td className="py-2 pr-2">
          <input
            type="checkbox"
            data-testid={`row-select-${row.match_id}`}
            checked={selected}
            onChange={() => onToggleSelect(row.match_id)}
            aria-label={`Seleccionar ${row.store_product_name ?? row.match_id}`}
          />
        </td>
      ) : null}
      <td className="py-2 pr-4">
        <span
          data-testid="confidence-badge"
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceColor(row.confidence)}`}
        >
          {Math.round(row.confidence * 100)}%
        </span>
      </td>
      <td className="py-2 pr-4">
        <a href={href} className="font-medium hover:underline">
          <span data-testid="review-row-name">{row.store_product_name ?? "(sin nombre)"}</span>
        </a>
        {row.store_product_brand ? (
          <span className="ml-1 text-muted-foreground">— {row.store_product_brand}</span>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-muted-foreground">{row.store_product_size_text ?? "—"}</td>
      <td className="py-2 pr-4">{row.provider_name}</td>
      <td className="py-2 pr-4 text-muted-foreground">{row.method}</td>
      <td className="py-2 pr-4 text-center text-muted-foreground">{row.candidate_count}</td>
    </tr>
  );
}
