import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { serializeReviewQueueParams } from "../lib/review-queue-params";
import { REVIEW_METHOD, REVIEW_ORDER_BY, type ReviewQueueData, type ReviewQueueParams } from "../types";
import { ReviewRow } from "./ReviewRow";

// Sentinel de radix-ui Select: no acepta `value=""` en un SelectItem, así que "todos" viaja como
// este string y se traduce a `undefined` (= sin filtro) al navegar.
const ALL = "__all__";

// Pantalla de la cola de revisión (feature #8, F2·B1): lee la página SSR (`+data.ts`, batch 2.11)
// vía `useData` (mismo patrón que ProductScreen/CategoryListing) y escribe cada cambio de filtro
// en la URL vía `navigate()` (mismo patrón que CategoryFilters) → el servidor re-renderiza con el
// filtro aplicado, estado 100% shareable por link (batch 2.14/2.15). El orden de las filas es
// EXACTAMENTE el que trae `rows` — el default "uncertainty-first" es responsabilidad del backend
// (`ListReviewQueue`, ya testeado en Fase 1); esta pantalla nunca reordena client-side.
export function ReviewQueueListScreen() {
  const { rows, total, params } = useData<ReviewQueueData>();
  const pageContext = usePageContext();

  const navigateWith = (patch: Partial<ReviewQueueParams>) => {
    const next: ReviewQueueParams = { ...params, ...patch };
    const qs = serializeReviewQueueParams(next).toString();
    void navigate(qs ? `${pageContext.urlPathname}?${qs}` : pageContext.urlPathname);
  };

  const from = params.limit && total > 0 ? params.offset + 1 : 0;
  const to = Math.min(params.offset + params.limit, total);
  const hasPrev = params.offset > 0;
  const hasNext = params.offset + params.limit < total;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Cola de revisión (Save)</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="provider-filter" className="mb-1 block text-xs text-muted-foreground">
            Proveedor (id)
          </label>
          <Input
            id="provider-filter"
            placeholder="provider_id"
            defaultValue={params.provider_id ?? ""}
            className="w-40"
            onBlur={(e) =>
              navigateWith({ provider_id: e.target.value.trim() || undefined, offset: 0 })
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Método</label>
          <Select
            value={params.method ?? ALL}
            onValueChange={(v) =>
              navigateWith({ method: v === ALL ? undefined : v, offset: 0 })
            }
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {REVIEW_METHOD.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="confidence-min" className="mb-1 block text-xs text-muted-foreground">
            Confianza mín.
          </label>
          <Input
            id="confidence-min"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={params.confidence_min ?? ""}
            className="w-24"
            onBlur={(e) =>
              navigateWith({
                confidence_min: e.target.value ? Number(e.target.value) : undefined,
                offset: 0,
              })
            }
          />
        </div>

        <div>
          <label htmlFor="confidence-max" className="mb-1 block text-xs text-muted-foreground">
            Confianza máx.
          </label>
          <Input
            id="confidence-max"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={params.confidence_max ?? ""}
            className="w-24"
            onBlur={(e) =>
              navigateWith({
                confidence_max: e.target.value ? Number(e.target.value) : undefined,
                offset: 0,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Orden</label>
          <Select
            value={params.order_by}
            onValueChange={(v) => navigateWith({ order_by: v, offset: 0 })}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_ORDER_BY.map((o) => (
                <SelectItem key={o} value={o}>
                  {o === "uncertainty" ? "Incertidumbre (default)" : "Más antiguo primero"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Confianza</th>
            <th className="py-2 pr-4 font-medium">Producto</th>
            <th className="py-2 pr-4 font-medium">Tamaño</th>
            <th className="py-2 pr-4 font-medium">Tienda</th>
            <th className="py-2 pr-4 font-medium">Método</th>
            <th className="py-2 pr-4 text-center font-medium">Candidatos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ReviewRow key={r.match_id} row={r} href={`/admin/review-queue/${r.match_id}`} />
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No hay elementos en la cola con estos filtros.
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {from}–{to} de {total}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => navigateWith({ offset: Math.max(0, params.offset - params.limit) })}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => navigateWith({ offset: params.offset + params.limit })}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
