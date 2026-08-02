import type { ProviderDto } from "@cuadra/api-client";
import { Archive, Plus, Search, Settings2, Store } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui-base/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
// El embudo es un SVG DUOTONO propio del Figma, no un ícono de Lucide: `SlidersHorizontal` u otro
// equivalente rompe la familia visual del toolbar. El import cross-resource desde `save-matching`
// es el patrón establecido de la consola (Fuentes hace lo mismo).
import { FunnelIcon } from "@/features/admin/resources/save-matching/components/toolbar-icons";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { AdminTableFooter } from "@/features/admin/components/AdminTableFooter";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { format } from "@/i18n/messages";

import { listProvidersEntries } from "../api";
import type { ProvidersData } from "../interfaces";
import { PROVIDER_TYPE_OPTIONS, SOURCE_PLATFORM_OPTIONS } from "../types";
import { ProviderModal, type ProviderModalState } from "./ProviderModal";
import { ProviderRow } from "./ProviderRow";
import { usePagination } from "@/features/admin/shell/use-pagination";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const ANY = "__any__";
type SortState = "asc" | "desc" | "none";
type StatusFilter = "active" | "archived" | "all";

interface Filters {
  type: string;
  platform: string;
  status: StatusFilter;
}

const EMPTY_FILTERS: Filters = { type: ANY, platform: ANY, status: "active" };

// Consola de Proveedores (§7.2 + `docs/design-briefs/proveedores-redesign-brief.md`).
//
// Reemplaza el formulario MVP —un alta suelta y, debajo, un mini-formulario inline POR proveedor
// con dos botones "Guardar" cada uno— por el mismo lenguaje que Cola de revisión y Fuentes:
// contenedor `rounded-[32px]`, buscador-pill, modal de filtros, tabla con headers ordenables, menú
// de acciones por fila y paginación. Sin TanStack Query: `useAdminList` refresca tras mutar
// (gotcha #9 de cuadra-save-admin).
//
// El filtro vive en DOS capas: `draft` (lo que el operador toca dentro del modal) y `applied` (lo
// que la tabla obedece). Sin esa separación, mover un select filtraría la tabla por debajo del
// modal abierto y el botón "Aplicar" no significaría nada.
export function ProvidersScreen() {
  const { providers: initialProviders, locale = DEFAULT_LOCALE } = useData<
    ProvidersData & { locale?: Locale }
  >();
  const { t } = useAdminI18n(locale);

  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  // Pedir archivados es una QUERY distinta, no un filtro de cliente: el listado por defecto ni
  // siquiera los trae, así que el estado del filtro tiene que llegar hasta el fetcher.
  const { items: providers, refresh } = useAdminList(initialProviders, () =>
    listProvidersEntries("DO", { includeArchived: applied.status !== "active" }),
  );

  /** Refresca y AVISA si falló. Sin esto, un fallo de red tras mutar dejaba la tabla como estaba
   *  (o vacía) sin decir nada: el operador leía "no hay nada" cuando lo que hubo fue una petición
   *  caída. Datos viejos son mejores que una tabla que miente, pero hay que decir que son viejos. */
  const refreshOrWarn = async () => {
    if (!(await refresh())) toast(t("admin.list.refreshFailed"));
  };

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<ProviderModalState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>("name");
  const [sortDir, setSortDir] = useState<SortState>("asc");

  // `applied.status` cambia lo que devuelve el SERVIDOR, así que hay que re-pedir, no re-filtrar.
  // El ref salta el montaje A PROPÓSITO: `useAdminList` ya viene sembrado por el SSR de `+data.ts`,
  // así que refrescar al montar sería pedir dos veces exactamente lo mismo en cada carga de página
  // — y además pisaría los datos del SSR con un render vacío mientras vuelve la respuesta.
  const lastStatus = useRef(applied.status);
  useEffect(() => {
    if (lastStatus.current === applied.status) return;
    lastStatus.current = applied.status;
    void refreshOrWarn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.status]);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (needle && !`${p.name} ${p.market_id}`.toLowerCase().includes(needle)) return false;
      if (applied.type !== ANY && p.type !== applied.type) return false;
      if (applied.platform !== ANY && p.platform !== applied.platform) return false;
      // "archived" pide al backend activos+archivados; acá se queda solo con los archivados.
      if (applied.status === "archived" && !p.archived_at) return false;
      return true;
    });
  }, [providers, needle, applied]);

  const sorted = useMemo(
    () =>
      sortCol && sortDir !== "none"
        ? [...filtered].sort(comparatorFor(sortCol, sortDir))
        : filtered,
    [filtered, sortCol, sortDir],
  );

  // Paginación client-side: la aritmética vivía copiada en 10 pantallas (`use-pagination`).
  const {
    limit, setLimit, offset, setOffset,
    total, totalPages, currentPage, pageRows, from, to, pageSizeOptions,
  } = usePagination(sorted);

  useEffect(() => {
    setOffset(0);
  }, [needle, sortCol, sortDir, limit, applied]);

  const sortStateFor = (col: string): SortState => (sortCol === col ? sortDir : "none");
  const toggleSort = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? "none" : "asc"));
    }
  };

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...pageIds]);
    });

  const activeFilterCount =
    (applied.type !== ANY ? 1 : 0) +
    (applied.platform !== ANY ? 1 : 0) +
    (applied.status !== "active" ? 1 : 0);

  const emptyStateEl =
    providers.length === 0 ? (
      <p className="px-4 py-6 text-sm text-muted-foreground">{t("admin.providers.empty")}</p>
    ) : total === 0 ? (
      <p className="px-4 py-6 text-sm text-muted-foreground">{t("admin.providers.emptySearch")}</p>
    ) : null;

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted p-4 shadow-sm md:p-6 dark:bg-muted [corner-shape:squircle]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium text-black dark:text-white">
              {t("admin.providers.title")}
            </h1>
            <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">
              ({total})
            </span>
          </div>

          <button
            type="button"
            onClick={() => setModal({ mode: "add" })}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("admin.providers.add")}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{t("admin.providers.subtitle")}</p>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-white/10 dark:bg-white/5">
            <Search
              className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("admin.providers.search.aria")}
              placeholder={t("admin.providers.search.placeholder")}
              className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
            />
          </div>

          {/* Círculo lima con embudo verde bosque (duotono) — mismo botón que Cola de revisión. */}
          <div className="relative">
            <Button
              type="button"
              size="icon"
              className="size-9 rounded-full border-transparent bg-brand-lime text-brand-forest shadow-none hover:bg-brand-lime/90"
              aria-label={t("admin.providers.filters.open")}
              aria-expanded={filtersOpen}
              onClick={() => {
                setDraft(applied);
                setFiltersOpen(true);
              }}
            >
              <FunnelIcon className="size-[18px]" />
            </Button>
            {/* El contador existe porque un filtro aplicado con el modal cerrado es invisible: sin
                esto, una tabla "vacía" parece un bug en vez de un filtro activo. */}
            {activeFilterCount > 0 ? (
              <span className="pointer-events-none absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-brand-forest text-xs font-bold text-brand-lime">
                {activeFilterCount}
              </span>
            ) : null}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
          {/* `overflow-x-auto` DENTRO del card `overflow-hidden`: sin él las columnas de la derecha
              se recortan sin forma de llegar a ellas (gotcha de cuadra-save-admin). */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                  <TableHead className="w-10">
                    <SelectCheckbox
                      data-testid="select-all"
                      aria-label={t("admin.providers.selectAll")}
                      checked={allPageSelected}
                      disabled={pageIds.length === 0}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-16">{t("admin.providers.col.logo")}</TableHead>
                  <SortableHeader
                    label={t("admin.providers.col.name")}
                    state={sortStateFor("name")}
                    onToggle={() => toggleSort("name")}
                  />
                  <SortableHeader
                    label={t("admin.providers.col.market")}
                    state={sortStateFor("market")}
                    onToggle={() => toggleSort("market")}
                  />
                  <SortableHeader
                    label={t("admin.providers.col.type")}
                    state={sortStateFor("type")}
                    onToggle={() => toggleSort("type")}
                  />
                  <SortableHeader
                    label={t("admin.providers.col.platform")}
                    state={sortStateFor("platform")}
                    onToggle={() => toggleSort("platform")}
                  />
                  <TableHead>{t("admin.providers.col.status")}</TableHead>
                  {/* `w-16` para que la última columna NO absorba el ancho sobrante de la tabla:
                      con `table-layout:auto` el remanente se va a la última columna flexible, y el
                      encabezado quedaba a la izquierda con los botones a media pantalla.
                      `text-center` para que el título quede alineado con el botón de cada fila. */}
                  <TableHead className="w-16 text-center">
                    {t("admin.providers.col.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <ProviderRow
                    key={row.id}
                    provider={row}
                    selected={selected.has(row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onEdit={() => setModal({ mode: "edit", provider: row })}
                    refresh={refreshOrWarn}
                    t={t}
                    locale={locale}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {emptyStateEl}

          <AdminTableFooter
            limit={limit}
            onLimitChange={setLimit}
            pageSizeOptions={pageSizeOptions}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(pg) => setOffset((pg - 1) * limit)}
            rangeLabel={format(locale, "admin.providers.pagination.of", {
            from: String(from),
            to: String(to),
            total: String(total),
          })}
            showLabel={t("admin.providers.pagination.show")}
            perPageLabel={t("admin.providers.pagination.perPage")}
          />
        </div>
      </div>

      <FilterModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={t("admin.providers.filters.title")}
        icon={<FunnelIcon />}
        onClear={() => setDraft(EMPTY_FILTERS)}
        onApply={() => {
          setApplied(draft);
          setFiltersOpen(false);
        }}
        clearLabel={t("admin.providers.filters.all")}
        applyLabel={t("admin.providers.filters.title")}
      >
        <FilterField icon={<Store />} label={t("admin.providers.filters.type")}>
          <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
            <SelectTrigger aria-label={t("admin.providers.filters.type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("admin.providers.filters.all")}</SelectItem>
              {PROVIDER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Settings2 />} label={t("admin.providers.filters.platform")}>
          <Select value={draft.platform} onValueChange={(v) => setDraft({ ...draft, platform: v })}>
            <SelectTrigger aria-label={t("admin.providers.filters.platform")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("admin.providers.filters.all")}</SelectItem>
              {SOURCE_PLATFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={<Archive />} label={t("admin.providers.filters.status")}>
          <Select
            value={draft.status}
            onValueChange={(v) => setDraft({ ...draft, status: v as StatusFilter })}
          >
            <SelectTrigger aria-label={t("admin.providers.filters.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("admin.providers.filters.onlyActive")}</SelectItem>
              <SelectItem value="archived">{t("admin.providers.filters.onlyArchived")}</SelectItem>
              <SelectItem value="all">{t("admin.providers.filters.all")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterModal>

      {modal ? (
        <ProviderModal
          state={modal}
          onClose={() => setModal(null)}
          refresh={refreshOrWarn}
          t={t}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

function comparatorFor(col: string, dir: SortState) {
  const sign = dir === "desc" ? -1 : 1;
  return (a: ProviderDto, b: ProviderDto): number => {
    let cmp = 0;
    if (col === "name") cmp = a.name.localeCompare(b.name);
    else if (col === "market") cmp = a.market_id.localeCompare(b.market_id);
    else if (col === "type") cmp = a.type.localeCompare(b.type);
    else if (col === "platform") cmp = a.platform.localeCompare(b.platform);
    return cmp * sign;
  };
}

function SortTriangle({ state }: { state: SortState }) {
  const color = state === "none" ? "text-muted-foreground/40" : "text-primary";
  const path = state === "desc" ? "M0 0h10L5 6z" : "M5 0l5 6H0z";
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

function SortableHeader({
  label,
  state,
  onToggle,
}: {
  label: ReactNode;
  state: SortState;
  onToggle: () => void;
}) {
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

