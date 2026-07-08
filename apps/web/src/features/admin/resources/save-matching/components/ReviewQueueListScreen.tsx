import type { AdminReviewQueueRowDto, BulkResolveResultDto } from "@cuadra/api-client";
import { ArrowUpDown, Info } from "lucide-react";
import { useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE } from "@/i18n/config";

import { bulkResolveReviewMatches, fetchReviewQueue, fetchTopCandidateId } from "../api";
import { ADMIN_DECIDED_BY } from "../lib/decided-by";
import { serializeReviewQueueParams } from "../lib/review-queue-params";
import type { ReviewQueueData, ReviewQueueParams } from "../types";
import { ReasonCodeSelect } from "./ReasonCodeSelect";
import { ReviewQueueToolbar, type ReviewQueueView } from "./ReviewQueueToolbar";
import { ReviewRow } from "./ReviewRow";

type BulkOutcome = { succeeded: string[]; failed: { match_id: string; error: string }[] };

// Opciones fijas de "por página" (Figma: "Mostrar [5 ▾] por página") — si el `limit` vigente (URL)
// no está en esta lista (ej. el default de 50 del backend) se agrega dinámicamente para que el
// <Select> siempre tenga un valor válido seleccionado.
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

// Pantalla de la cola de revisión (feature #8, F2·B1; restyle Figma 483:12411 en Batch 6): lee la
// página SSR (`+data.ts`) vía `useData` y escribe cada cambio de filtro/orden/página en la URL vía
// `navigate()` — estado 100% shareable por link. El orden de las filas es EXACTAMENTE el que trae
// `rows` (uncertainty-first es responsabilidad del backend); esta pantalla nunca reordena
// client-side — el único filtro client-side es el de `search` (por nombre), documentado en
// `ReviewQueueToolbar`.
export function ReviewQueueListScreen() {
  const { rows: initialRows, total, params, locale = DEFAULT_LOCALE } = useData<ReviewQueueData>();
  const pageContext = usePageContext();
  const { t } = useAdminI18n(locale);

  // Reemplaza el `window.location.reload()` post-bulk-mutación: refetch client-side de la MISMA
  // página (mismos `params`) con `useAdminList` (shell/use-admin-list.ts), sin recargar. El `total`
  // del footer no se re-sincroniza tras un bulk-resolve (mismo alcance que `ProvidersScreen` — un
  // filtro/página nuevo vía URL siempre trae el total correcto); flag de follow-up si se necesita
  // exacto en caliente.
  const { items: rows, refresh } = useAdminList<AdminReviewQueueRowDto>(initialRows, async () => {
    const res = await fetchReviewQueue(params);
    return res?.rows ?? initialRows;
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkReject, setShowBulkReject] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ReviewQueueView>("list");

  const navigateWith = (patch: Partial<ReviewQueueParams>) => {
    const next: ReviewQueueParams = { ...params, ...patch };
    const qs = serializeReviewQueueParams(next).toString();
    void navigate(qs ? `${pageContext.urlPathname}?${qs}` : pageContext.urlPathname);
  };

  // Filtro CLIENT-SIDE por nombre de producto sobre las filas YA cargadas (el backend no tiene un
  // parámetro de texto todavía) — ver doc del prop `search` en `ReviewQueueToolbar`.
  const visibleRows = search.trim()
    ? rows.filter((r) => (r.store_product_name ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  const from = params.limit && total > 0 ? params.offset + 1 : 0;
  const to = Math.min(params.offset + params.limit, total);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, params.limit)));
  const currentPage = Math.min(totalPages, Math.floor(params.offset / Math.max(1, params.limit)) + 1);
  const pageNumbers = pageWindow(currentPage, totalPages);
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(params.limit)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, params.limit].sort((a, b) => a - b);

  const toggleSelect = (matchId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) =>
      visibleRows.length > 0 && prev.size === visibleRows.length
        ? new Set()
        : new Set(visibleRows.map((r) => r.match_id)),
    );
  };

  // "Eliminar" del menú Acciones por fila (Batch 6): reusa el flujo de rechazo EXISTENTE — se
  // selecciona SOLO esta fila y se abre el mismo panel `ReasonCodeSelect` que el bulk-reject, en
  // vez de inventar un segundo camino de rechazo individual.
  const handleDeleteRow = (matchId: string) => {
    setSelected(new Set([matchId]));
    setShowBulkReject(true);
  };

  const applyResult = async (
    server: BulkResolveResultDto | null,
    localFailed: { match_id: string; error: string }[],
  ) => {
    setBulkResult({
      succeeded: server?.succeeded ?? [],
      failed: [...(server?.failed ?? []), ...localFailed],
    });
    setSelected(new Set());
    await refresh();
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
    await applyResult(server, localFailed);
  };

  // Bulk-reject: UN request al endpoint atómico-por-fila (nunca N requests sueltos ni una
  // reimplementación del invariante same-tx en el cliente). El motivo es obligatorio (mismo guard
  // de `ReasonCodeSelect` que el rechazo individual) — aplica a TODAS las filas seleccionadas (que
  // puede ser una sola, si vino de "Eliminar" en el menú Acciones de una fila).
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
    await applyResult(
      server,
      server
        ? []
        : ids.map((matchId) => ({ match_id: matchId, error: "No se pudo contactar al servidor" })),
    );
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-bold">{t("admin.reviewQueue.title")}</h1>
        <Info
          className="size-4 text-muted-foreground"
          aria-label={t("admin.reviewQueue.info")}
          role="img"
        />
        <span className="text-sm font-semibold text-primary">({total})</span>
      </div>

      <ReviewQueueToolbar
        params={params}
        onParamsChange={(patch) => navigateWith({ ...patch, offset: 0 })}
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        selectedCount={selected.size}
        onBulkApprove={() => void handleBulkApprove()}
        onBulkReject={() => setShowBulkReject(true)}
        bulkBusy={bulkBusy}
        locale={locale}
      />

      {selected.size > 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {selected.size} {t("admin.reviewQueue.selectedSuffix")}
        </p>
      ) : null}

      {showBulkReject ? (
        <div className="mb-4" data-testid="bulk-reject-panel">
          <ReasonCodeSelect
            submitLabel={`${t("admin.toolbar.actions.reject")} (${selected.size})`}
            onReject={(payload) => void handleBulkReject(payload)}
          />
        </div>
      ) : null}

      {bulkResult ? (
        <div className="mb-4 rounded-md border border-border p-3 text-sm" data-testid="bulk-result">
          <p>
            {bulkResult.succeeded.length} {t("admin.reviewQueue.bulkResult.summary")} ·{" "}
            {bulkResult.failed.length} {t("admin.reviewQueue.bulkResult.failedSuffix")}
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
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                data-testid="select-all"
                checked={visibleRows.length > 0 && selected.size === visibleRows.length}
                onChange={toggleSelectAll}
                aria-label={t("admin.reviewQueue.selectAll")}
                disabled={visibleRows.length === 0}
              />
            </TableHead>
            <TableHead>{t("admin.reviewQueue.column.info")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.product")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.size")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.weightType")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.description")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.category")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.brand")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.store")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.method")}</TableHead>
            <TableHead>
              {/* Única columna sortable hoy: `order_by` solo admite "uncertainty" | "created_at"
                  (ver `types.ts`) y "Fecha del match" es la única del Figma que mapea a ese eje. */}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium"
                onClick={() =>
                  navigateWith({
                    order_by: params.order_by === "created_at" ? "uncertainty" : "created_at",
                    offset: 0,
                  })
                }
                aria-sort={params.order_by === "created_at" ? "ascending" : "none"}
              >
                {t("admin.reviewQueue.column.matchDate")}
                <ArrowUpDown className="size-3" aria-hidden="true" />
              </button>
            </TableHead>
            <TableHead>{t("admin.reviewQueue.column.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((r) => (
            <ReviewRow
              key={r.match_id}
              row={r}
              href={`/admin/review-queue/${r.match_id}`}
              locale={locale}
              selected={selected.has(r.match_id)}
              onToggleSelect={toggleSelect}
              onDelete={handleDeleteRow}
            />
          ))}
        </TableBody>
      </Table>

      {visibleRows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("admin.reviewQueue.empty")}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{t("admin.reviewQueue.pagination.showing")}</span>
          <Select
            value={String(params.limit)}
            onValueChange={(v) => navigateWith({ limit: Number(v), offset: 0 })}
          >
            <SelectTrigger size="sm" className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>{t("admin.reviewQueue.pagination.perPage")}</span>
        </div>

        <span>
          {from}–{to} {t("admin.reviewQueue.pagination.of")} {total}
        </span>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => navigateWith({ offset: Math.max(0, params.offset - params.limit) })}
                aria-disabled={currentPage <= 1}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {pageNumbers.map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === currentPage}
                  onClick={() => navigateWith({ offset: (p - 1) * params.limit })}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => navigateWith({ offset: params.offset + params.limit })}
                aria-disabled={currentPage >= totalPages}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

// Ventana contigua de hasta `max` números de página centrada en `current` (Figma: "1 2 3 4 5", sin
// elipsis) — PURA, sin estado; se recalcula en cada render a partir de `total`/`current`.
function pageWindow(current: number, total: number, max = 5): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = start + max - 1;
  if (end > total) {
    end = total;
    start = end - max + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
