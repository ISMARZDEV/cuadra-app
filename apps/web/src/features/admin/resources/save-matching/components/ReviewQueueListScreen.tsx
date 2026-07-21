import type { AdminReviewQueueRowDto, BulkResolveResultDto } from "@cuadra/api-client";
import { Info, RefreshCw, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";
import { toast } from "sonner";
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
import { providerLogoByName } from "@/features/save/lib/provider-logos";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { format } from "@/i18n/messages";

import {
  bulkResolveReviewMatches,
  classifySelected,
  createCanonicalsFromSelection,
  fetchReviewQueue,
  fetchTopCandidateId,
  setStoreProductCategory,
} from "../api";
import { ADMIN_DECIDED_BY } from "../lib/decided-by";
import { serializeReviewQueueParams } from "../lib/review-queue-params";
import type { ReviewQueueData, ReviewQueueParams } from "../types";
import { ReviewQueueKpis } from "./kpi/ReviewQueueKpis";
import { ReasonCodeSelect } from "./ReasonCodeSelect";
import { SelectCheckbox } from "./SelectCheckbox";
import { CreateCanonicalsDialog } from "./CreateCanonicalsDialog";
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
  const {
    rows: initialRows,
    total,
    params,
    providers = [],
    taxonomyLeaves = [],
    locale = DEFAULT_LOCALE,
  } = useData<ReviewQueueData>();
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
  const [showCanonize, setShowCanonize] = useState(false);

  /** Crea los canónicos y refresca. El resumen dice los TRES estados; las omitidas se nombran
   *  porque son trabajo que quedó pendiente, no un error. */
  async function handleCanonize(
    fallbackTaxonomyNodeId: string | null,
    overrides: Record<string, string>,
  ) {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await createCanonicalsFromSelection(ids, fallbackTaxonomyNodeId, overrides);
      if (result) {
        toast(format(locale, "admin.reviewQueue.canonize.done", { n: String(result.created) }));
        // Las creadas ya salieron de la cola: la selección apunta a filas que ya no existen.
        setSelected(new Set());
      }
      setShowCanonize(false);
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  /** Clasifica lo seleccionado y REFRESCA: la tabla es donde el operador ve qué se llenó y qué no.
   *  El resumen se muestra completo —clasificadas · sin decidir · con error— porque el clasificador
   *  deja huecos a propósito, y un lote a medias no puede leerse como terminado. */
  async function handleBulkClassify() {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await classifySelected(ids);
      if (result) {
        const parts = [format(locale, "admin.reviewQueue.classify.done", { n: String(result.classified) })];
        if (result.undecided > 0) {
          parts.push(format(locale, "admin.reviewQueue.classify.undecided", { n: String(result.undecided) }));
        }
        if (result.failed.length > 0) {
          parts.push(format(locale, "admin.reviewQueue.classify.failed", { n: String(result.failed.length) }));
        }
        toast(parts.join(" · "));
      }
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  // ¿Alguna fila SELECCIONADA tiene candidatos? "Aprobar seleccionados" enlaza cada fila a su
  // candidato top; sobre filas sin candidatos no puede hacer nada y devuelve una lista de fallos.
  // Misma doctrina que Orquestación: un ítem que no afectaría a nada NO se ofrece — prometer una
  // acción que no ocurre es peor que no tenerla. En un catálogo en arranque en frío esto es el caso
  // NORMAL (medido: 48 de 48 filas con 0 candidatos), no una rareza.
  const hasCandidatesSelected = rows.some(
    (r) => selected.has(r.match_id) && r.candidate_count > 0,
  );

  const navigateWith = (patch: Partial<ReviewQueueParams>) => {
    const next: ReviewQueueParams = { ...params, ...patch };
    const qs = serializeReviewQueueParams(next).toString();
    void navigate(qs ? `${pageContext.urlPathname}?${qs}` : pageContext.urlPathname);
  };

  // Estado de orden de una columna a partir del `order_by` vigente: `col` = asc, `-col` = desc,
  // cualquier otra cosa = sin orden por esta columna. Alimenta el triángulo del header (Figma).
  const sortStateFor = (col: string): SortState =>
    params.order_by === col ? "asc" : params.order_by === `-${col}` ? "desc" : "none";

  // Click en un header ordenable: cicla none → asc (`col`) → desc (`-col`) → default (`uncertainty`).
  // Resetea el offset (una página nueva de orden siempre arranca en la 1). El backend ordena en SQL
  // (paginación correcta contra `total`), esta pantalla nunca reordena client-side.
  const toggleSort = (col: string) => {
    const state = sortStateFor(col);
    const nextOrderBy = state === "none" ? col : state === "asc" ? `-${col}` : "uncertainty";
    navigateWith({ order_by: nextOrderBy, offset: 0 });
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
    // Los `fetchTopCandidateId` son independientes entre filas → se resuelven en paralelo.
    // `Promise.all` preserva el orden del input, así que la partición approvable/failed queda estable.
    const resolved = await Promise.all(
      ids.map(async (matchId) => ({ matchId, topCandidateId: await fetchTopCandidateId(matchId) })),
    );
    for (const { matchId, topCandidateId } of resolved) {
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
    // Todo el workspace vive dentro de UNA card contenedora (Figma): mismo gris que el `AdminTopBar`
    // (`bg-muted/60` claro / `bg-secondary` oscuro) + radio grande con corner-smoothing tipo Figma.
    // `[corner-shape:squircle]` es progressive-enhancement: donde el navegador lo soporta suaviza la
    // superelipse; donde no, cae limpio al `rounded-[32px]`. La card llena el alto (`flex-1`).
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">
          {t("admin.reviewQueue.title")}
        </h1>
        <Info
          className="size-4 text-muted-foreground"
          aria-label={t("admin.reviewQueue.info")}
          role="img"
        />
        <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">({total})</span>
        <button
          type="button"
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-brand-forest px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-forest/90"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {t("admin.reviewQueue.sync")}
        </button>
      </div>

      {/* Deep-link corrida→cola (F4 #4.7): cuando la cola llega filtrada por una corrida (`?run_id=`),
          lo DECLARA explícitamente + ofrece salir del filtro. Sin esto el operador ve una cola
          recortada sin saber por qué. */}
      {params.run_id ? (
        <div
          data-testid="run-filter-banner"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-forest/20 bg-brand-lime/10 px-3 py-2 text-sm dark:border-brand-lime/20 dark:bg-brand-forest/25"
        >
          <span className="text-muted-foreground">{t("admin.reviewQueue.runFilter.label")}</span>
          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs text-brand-forest dark:bg-white/10 dark:text-brand-lime">
            {params.run_id}
          </code>
          <button
            type="button"
            data-testid="run-filter-clear"
            onClick={() => navigateWith({ run_id: undefined, offset: 0 })}
            className="ml-auto inline-flex items-center gap-1 font-medium text-brand-forest underline underline-offset-2 hover:no-underline dark:text-brand-lime"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t("admin.reviewQueue.runFilter.clear")}
          </button>
        </div>
      ) : null}

      <ReviewQueueKpis locale={locale} />

      <CreateCanonicalsDialog
        open={showCanonize}
        onOpenChange={setShowCanonize}
        rows={rows.filter((r) => selected.has(r.match_id))}
        leaves={taxonomyLeaves}
        onConfirm={(fallback, overrides) => void handleCanonize(fallback, overrides)}
        busy={bulkBusy}
        locale={locale}
      />

      <ReviewQueueToolbar
        params={params}
        onParamsChange={(patch) => navigateWith({ ...patch, offset: 0 })}
        providers={providers.map((p) => {
          const logo = p.logo_url ?? providerLogoByName(p.name);
          return {
            value: p.id,
            label: p.name,
            icon: logo ? (
              <img src={logo} alt="" className="max-h-5 max-w-8 object-contain" />
            ) : undefined,
          };
        })}
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        selectedCount={selected.size}
        onBulkApprove={() => void handleBulkApprove()}
        hasCandidatesSelected={hasCandidatesSelected}
        onBulkReject={() => setShowBulkReject(true)}
        onBulkClassify={() => void handleBulkClassify()}
        onBulkCanonize={() => setShowCanonize(true)}
        bulkBusy={bulkBusy}
        locale={locale}
      />

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
                  {/* El NOMBRE del producto, no el UUID: el operador no reconoce
                      `20085201-29c5-…` como nada, así que una lista de uuids es una lista de
                      errores que no puede ni leer. El id solo aparece si la fila ya no está
                      cargada (paginó o se refrescó), donde es lo único que tenemos. */}
                  {rows.find((r) => r.match_id === f.match_id)?.store_product_name ?? f.match_id}
                  {" — "}
                  {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
      <Table>
        <TableHeader>
          {/* Header con división normal: divisor inferior (border-b por defecto del TableRow), sin
              barra ni esquinas redondeadas. Labels semibold muted, un punto más grandes (text-sm). Los
              carets grises son el afford. de orden; las columnas ordenables van wireadas a `order_by`. */}
          <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
            <TableHead>
              <SelectCheckbox
                data-testid="select-all"
                checked={visibleRows.length > 0 && selected.size === visibleRows.length}
                onChange={toggleSelectAll}
                aria-label={t("admin.reviewQueue.selectAll")}
                disabled={visibleRows.length === 0}
              />
            </TableHead>
            <TableHead>{t("admin.reviewQueue.column.confidence")}</TableHead>
            <TableHead>{t("admin.reviewQueue.column.image")}</TableHead>
            {/* Columnas ORDENABLES (Figma: caret por columna). Cada `col` matchea la clave del
                backend (`product_match_repository.sortable`); un click cicla none→asc→desc. */}
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.product")}
              state={sortStateFor("name")}
              onToggle={() => toggleSort("name")}
            />
            <TableHead>{t("admin.reviewQueue.column.size")}</TableHead>
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.weightType")}
              state={sortStateFor("size")}
              onToggle={() => toggleSort("size")}
            />
            <TableHead>{t("admin.reviewQueue.column.description")}</TableHead>
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.category")}
              state={sortStateFor("category")}
              onToggle={() => toggleSort("category")}
            />
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.brand")}
              state={sortStateFor("brand")}
              onToggle={() => toggleSort("brand")}
            />
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.store")}
              state={sortStateFor("provider")}
              onToggle={() => toggleSort("provider")}
            />
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.method")}
              state={sortStateFor("method")}
              onToggle={() => toggleSort("method")}
            />
            <SortableColumnHeader
              label={t("admin.reviewQueue.column.matchDate")}
              state={sortStateFor("created_at")}
              onToggle={() => toggleSort("created_at")}
            />
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
              taxonomyLeaves={taxonomyLeaves}
              onSetCategory={setStoreProductCategory}
            />
          ))}
        </TableBody>
      </Table>

      {visibleRows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t("admin.reviewQueue.empty")}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
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
      </div>
    </div>
  );
}

type SortState = "asc" | "desc" | "none";

// Indicador de orden del Figma (nodo 483:12422): triángulo RELLENO con 3 estados —
// `none` = gris ▲ (sin orden, default) · `asc` = verde ▲ (ascendente activo) · `desc` = verde ▼
// (descendente activo). SVG puro (no lucide) para que sea un triángulo SÓLIDO, no un chevron.
function SortTriangle({ state }: { state: SortState }) {
  const color = state === "none" ? "text-muted-foreground/40" : "text-primary";
  const path = state === "desc" ? "M0 0h10L5 6z" : "M5 0l5 6H0z"; // ▼ vs ▲
  return (
    <svg viewBox="0 0 10 6" className={`h-[6px] w-[10px] shrink-0 ${color}`} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

const ARIA_SORT: Record<SortState, "none" | "ascending" | "descending"> = {
  none: "none",
  asc: "ascending",
  desc: "descending",
};

// Header de columna ORDENABLE: botón con el label + el triángulo del estado vigente. Un click
// cicla none → asc → desc → none (ver `toggleSort` en el screen). El backend soporta cada columna
// en ambas direcciones vía `order_by` con prefijo "-" (product_match_repository).
function SortableColumnHeader({
  label,
  state,
  onToggle,
}: {
  label: ReactNode;
  state: SortState;
  onToggle: () => void;
}) {
  // `aria-sort` es válido en el `<th>` (rol columnheader), NO en el botón — de ahí que el
  // TableHead viva DENTRO del header ordenable en vez de envolverlo desde el call site.
  return (
    <TableHead aria-sort={ARIA_SORT[state]}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 font-semibold"
      >
        {label}
        <SortTriangle state={state} />
      </button>
    </TableHead>
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
