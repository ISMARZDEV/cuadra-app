import type { BulkResolveResultDto } from "@cuadra/api-client";
import { useState } from "react";
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

import { bulkResolveReviewMatches, fetchTopCandidateId } from "../api";
import { ADMIN_DECIDED_BY } from "../lib/decided-by";
import { serializeReviewQueueParams } from "../lib/review-queue-params";
import { REVIEW_METHOD, REVIEW_ORDER_BY, type ReviewQueueData, type ReviewQueueParams } from "../types";
import { ReasonCodeSelect } from "./ReasonCodeSelect";
import { ReviewRow } from "./ReviewRow";

type BulkOutcome = { succeeded: string[]; failed: { match_id: string; error: string }[] };

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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkReject, setShowBulkReject] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);

  const navigateWith = (patch: Partial<ReviewQueueParams>) => {
    const next: ReviewQueueParams = { ...params, ...patch };
    const qs = serializeReviewQueueParams(next).toString();
    void navigate(qs ? `${pageContext.urlPathname}?${qs}` : pageContext.urlPathname);
  };

  const from = params.limit && total > 0 ? params.offset + 1 : 0;
  const to = Math.min(params.offset + params.limit, total);
  const hasPrev = params.offset > 0;
  const hasNext = params.offset + params.limit < total;

  const toggleSelect = (matchId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.match_id))));
  };

  const applyResult = (server: BulkResolveResultDto | null, localFailed: { match_id: string; error: string }[]) => {
    setBulkResult({
      succeeded: server?.succeeded ?? [],
      failed: [...(server?.failed ?? []), ...localFailed],
    });
    setSelected(new Set());
  };

  // Bulk-approve (feature #10, batch 2e): la lista SOLO trae `candidate_count` (nunca el id del
  // candidato) — aprobar sin ver a qué canónico se enlaza arriesga el falso-merge que
  // `cuadra-save-matching` marca como el peor caso. Por eso resuelve el candidato TOP de cada fila
  // seleccionada (mismo "top" que usa el atajo `a` en el detalle) ANTES de enlazar; filas sin
  // candidatos se reportan como fallo LOCAL, nunca se envían silenciosamente.
  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    setBulkBusy(true);
    setBulkResult(null);

    const localFailed: { match_id: string; error: string }[] = [];
    const approvable: { matchId: string; canonicalProductId: string }[] = [];
    for (const matchId of ids) {
      const topCandidateId = await fetchTopCandidateId(matchId);
      if (topCandidateId) {
        approvable.push({ matchId, canonicalProductId: topCandidateId });
      } else {
        localFailed.push({ match_id: matchId, error: "Sin candidatos para auto-aprobar" });
      }
    }

    const server =
      approvable.length > 0
        ? await bulkResolveReviewMatches(
            approvable.map((a) => ({
              matchId: a.matchId,
              canonicalProductId: a.canonicalProductId,
              decidedBy: ADMIN_DECIDED_BY,
            })),
          )
        : null;

    setBulkBusy(false);
    applyResult(server, localFailed);
  };

  // Bulk-reject: UN request al endpoint atómico-por-fila (nunca N requests sueltos ni una
  // reimplementación del invariante same-tx en el cliente). El motivo es obligatorio (mismo guard
  // de `ReasonCodeSelect` que el rechazo individual) — aplica a TODAS las filas seleccionadas.
  const handleBulkReject = async ({ reasonCode, reasonNote }: { reasonCode: string; reasonNote: string }) => {
    const ids = Array.from(selected);
    setBulkBusy(true);
    setBulkResult(null);

    const server = await bulkResolveReviewMatches(
      ids.map((matchId) => ({
        matchId,
        canonicalProductId: null,
        decidedBy: ADMIN_DECIDED_BY,
        reasonCode,
        reasonNote: reasonNote || undefined,
      })),
    );

    setBulkBusy(false);
    setShowBulkReject(false);
    applyResult(
      server,
      server
        ? []
        : ids.map((matchId) => ({ match_id: matchId, error: "No se pudo contactar al servidor" })),
    );
  };

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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="checkbox"
          data-testid="select-all"
          checked={rows.length > 0 && selected.size === rows.length}
          onChange={toggleSelectAll}
          aria-label="Seleccionar todos"
          disabled={rows.length === 0}
        />
        <span className="text-xs text-muted-foreground">{selected.size} seleccionado(s)</span>
        {selected.size > 0 ? (
          <>
            <Button size="sm" disabled={bulkBusy} onClick={() => void handleBulkApprove()}>
              Aprobar (candidato top)
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => setShowBulkReject((v) => !v)}
            >
              Rechazar seleccionados…
            </Button>
          </>
        ) : null}
      </div>

      {showBulkReject ? (
        <div className="mb-4" data-testid="bulk-reject-panel">
          <ReasonCodeSelect
            submitLabel={`Rechazar ${selected.size} seleccionado(s)`}
            onReject={(payload) => void handleBulkReject(payload)}
          />
        </div>
      ) : null}

      {bulkResult ? (
        <div className="mb-4 rounded-md border border-border p-3 text-sm" data-testid="bulk-result">
          <p>
            {bulkResult.succeeded.length} aprobado(s)/rechazado(s) · {bulkResult.failed.length} fallaron
          </p>
          {bulkResult.failed.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-destructive">
              {bulkResult.failed.map((f) => (
                <li key={f.match_id} data-testid="bulk-result-failure">
                  {f.match_id} — {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            Refrescar lista
          </Button>
        </div>
      ) : null}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium" />
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
            <ReviewRow
              key={r.match_id}
              row={r}
              href={`/admin/review-queue/${r.match_id}`}
              selected={selected.has(r.match_id)}
              onToggleSelect={toggleSelect}
            />
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
