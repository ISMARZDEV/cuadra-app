import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { ChevronDown, ListChecks, Plus, Search, Tags, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import { FunnelIcon } from "@/features/admin/resources/save-matching/components/toolbar-icons";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { format } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";

import { archiveCanonicalProduct, listCanonicalProducts, unarchiveCanonicalProduct } from "../api";
import type { CanonicalProductsData } from "../interfaces";
import {
  type CanonicalProductsParams,
  countActiveFilters,
  serializeCanonicalProductsParams,
} from "../lib/canonical-products-params";
import { CanonicalFiltersModal } from "./CanonicalFiltersModal";
import { CanonicalFormModal, type CanonicalFormState } from "./CanonicalFormModal";
import { BulkCategoryModal } from "./BulkCategoryModal";
import { CanonicalProductRow } from "./CanonicalProductRow";
import { ImportCanonicalModal } from "./ImportCanonicalModal";
import { ProvidersModal } from "./ProvidersModal";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const SEARCH_DEBOUNCE_MS = 350;

// Catálogo canónico (F5). Mismo lenguaje visual que Fuentes y Cola de revisión: contenedor
// `rounded-[32px]`, buscador-pill, filtros en modal, tabla en card y paginación numerada.
// La paginación es SERVER-side con estado en la URL: el listado puede tener decenas de miles de
// filas y el total tiene que contarse sobre lo filtrado, no sobre lo que se trajo.
export function CanonicalProductsScreen() {
  const {
    list: initialList,
    params: initialParams,
    taxonomyLeaves = [],
    locale = DEFAULT_LOCALE,
  } = useData<CanonicalProductsData>();
  const { t } = useAdminI18n(locale);

  const [list, setList] = useState(initialList);
  const [params, setParams] = useState(initialParams);
  const [searchDraft, setSearchDraft] = useState(initialParams.search ?? "");
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [formState, setFormState] = useState<CanonicalFormState | null>(null);
  const [providersFor, setProvidersFor] = useState<AdminCanonicalProductRowDto | null>(null);
  // Archivar SIEMPRE pasa por confirmación fuerte: saca el producto del sitio público.
  const [archiveTarget, setArchiveTarget] = useState<AdminCanonicalProductRowDto | null>(null);
  const [archiving, setArchiving] = useState(false);
  // Selección para acciones en lote (US-CP-L10), mismo patrón que la Cola de revisión.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);

  // El primer render ya trae los datos del SSR: refetchear ahí sería pedir dos veces lo mismo.
  const hydrated = useRef(false);

  async function applyParams(patch: Partial<CanonicalProductsParams>) {
    const next = { ...params, ...patch, offset: patch.offset ?? 0 };
    setParams(next);
    setLoading(true);

    const qs = serializeCanonicalProductsParams(next).toString();
    void navigate(qs ? `/admin/canonical-products?${qs}` : "/admin/canonical-products", {
      overwriteLastHistoryEntry: true,
    });

    const result = await listCanonicalProducts({
      search: next.search,
      brand_id: next.brand_id,
      taxonomy_node_id: next.taxonomy_node_id,
      quality_status: next.quality_status,
      ean_reachable: next.ean_reachable,
      min_provider_count: next.min_provider_count,
      updated_since: next.updated_since,
      include_archived: next.include_archived,
      sort: next.sort,
      limit: next.limit,
      offset: next.offset,
    });
    if (result) setList(result);
    setLoading(false);
  }

  // Debounce del buscador: sin esto cada tecla dispara una navegación Y un request — escribir
  // "arroz" costaba 5 de cada uno.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const id = setTimeout(() => {
      void applyParams({ search: searchDraft.trim() || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const total = list.total;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  const currentPage = Math.min(totalPages, Math.floor(params.offset / params.limit) + 1);
  const from = total > 0 ? params.offset + 1 : 0;
  const to = Math.min(params.offset + params.limit, total);
  const activeFilters = countActiveFilters(params);
  const hasQuery = Boolean(params.search) || activeFilters > 0;

  const refresh = () => void applyParams({ offset: params.offset });

  const pageIds = list.rows.map((r) => r.canonical_product_id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      // Sólo se toca la página ACTUAL: vaciar una selección hecha en otra página sin avisar
      // sería perder trabajo del operador en silencio.
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
        return next;
      }
      pageIds.forEach((id) => next.add(id));
      return next;
    });

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    await archiveCanonicalProduct(archiveTarget.canonical_product_id);
    setArchiving(false);
    setArchiveTarget(null);
    refresh();
  };

  // Restaurar NO pide confirmación: devolver algo a su estado anterior no destruye nada, y
  // agregarle una fricción que la acción destructiva ya tiene sólo entrena a ignorar los diálogos.
  const unarchive = async (row: AdminCanonicalProductRowDto) => {
    await unarchiveCanonicalProduct(row.canonical_product_id);
    refresh();
  };

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted p-4 shadow-sm md:p-6 dark:bg-muted [corner-shape:squircle]">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-medium text-black dark:text-white">
            {t("admin.canonicalProducts.title")}
          </h1>
          <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">
            ({total})
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t("admin.canonicalProducts.subtitle")}</p>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* El foco vive en el pill, no en el `Input` (que anula su anillo para no dibujar
                dos). Sin `focus-within` el buscador se enfocaba sin ninguna señal visible. */}
            <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-white/10 dark:bg-white/5">
              <Search
                className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                aria-label={t("admin.canonicalProducts.search.aria")}
                placeholder={t("admin.canonicalProducts.search.placeholder")}
                className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
              />
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={t("admin.canonicalProducts.filters.button")}
              className="relative flex size-9 items-center justify-center rounded-full bg-brand-lime text-brand-forest hover:bg-brand-lime/90"
            >
              <FunnelIcon className="size-4" />
              {activeFilters > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-brand-forest text-[10px] font-bold text-brand-lime">
                  {activeFilters}
                </span>
              ) : null}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={selected.size === 0}
                className="flex h-9 items-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime disabled:opacity-50"
              >
                <ListChecks className="size-[18px]" />
                {t("admin.canonicalProducts.bulk.actions")}
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setBulkCategoryOpen(true)}>
                  <Tags />
                  {format(locale, "admin.canonicalProducts.bulk.assignCategory", {
                    count: String(selected.size),
                  })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime shadow-sm"
            >
              <Upload className="size-4" aria-hidden="true" />
              {t("admin.canonicalProducts.import")}
            </button>
            <button
              type="button"
              onClick={() => setFormState({ mode: "create" })}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("admin.canonicalProducts.add")}
            </button>
          </div>
        </div>

        {/* El card es `overflow-hidden`, pero `Table` ya trae su propio wrapper
            `overflow-x-auto`: con 12 columnas la tabla excede el ancho y sin ese scroll las
            últimas columnas (entre ellas Acciones) quedarían recortadas sin forma de llegar.
            Verificado: scrollWidth 1203 > clientWidth 1176. NO anidar otro scroller acá. */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
          <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                  <TableHead className="w-10">
                    <SelectCheckbox
                      data-testid="select-all"
                      aria-label={t("admin.canonicalProducts.bulk.selectAll")}
                      checked={allPageSelected}
                      disabled={pageIds.length === 0}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-16">{t("admin.canonicalProducts.col.image")}</TableHead>
                  <SortableHead
                    label={t("admin.canonicalProducts.col.product")}
                    active={params.sort === "name" || params.sort === "-name" || !params.sort}
                    desc={params.sort === "-name"}
                    onToggle={() =>
                      void applyParams({ sort: params.sort === "name" ? "-name" : "name" })
                    }
                  />
                  <TableHead>{t("admin.canonicalProducts.col.brand")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.col.size")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.col.weight")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.col.category")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.filters.ean")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.col.price")}</TableHead>
                  <SortableHead
                    label={t("admin.canonicalProducts.col.completeness")}
                    active={params.sort === "completeness" || params.sort === "-completeness"}
                    desc={params.sort === "-completeness"}
                    className="text-right"
                    onToggle={() =>
                      void applyParams({
                        sort: params.sort === "-completeness" ? "completeness" : "-completeness",
                      })
                    }
                  />
                  <TableHead>{t("admin.canonicalProducts.col.quality")}</TableHead>
                  <SortableHead
                    label={t("admin.canonicalProducts.col.lastPrice")}
                    active={params.sort === "updated" || params.sort === "-updated"}
                    desc={params.sort === "-updated"}
                    onToggle={() =>
                      void applyParams({
                        sort: params.sort === "-updated" ? "updated" : "-updated",
                      })
                    }
                  />
                  <TableHead>{t("admin.canonicalProducts.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <CanonicalProductRow
                    key={row.canonical_product_id}
                    row={row}
                    locale={locale}
                    selected={selected.has(row.canonical_product_id)}
                    onToggleSelect={toggleSelect}
                    onViewProviders={setProvidersFor}
                    onEdit={(r) => setFormState({ mode: "edit", row: r })}
                    onArchive={setArchiveTarget}
                    onUnarchive={(r) => void unarchive(r)}
                    publicHref={row.slug ? `/${locale}/do/save/producto/${row.slug}` : null}
                  />
                ))}
              </TableBody>
          </Table>

          {list.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t(
                hasQuery
                  ? "admin.canonicalProducts.emptySearch"
                  : "admin.canonicalProducts.empty",
              )}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>{t("admin.canonicalProducts.pagination.show")}</span>
              <Select
                value={String(params.limit)}
                onValueChange={(v) => void applyParams({ limit: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{t("admin.canonicalProducts.pagination.perPage")}</span>
            </div>

            <span className={cn(loading && "opacity-50")}>
              {format(locale, "admin.canonicalProducts.pagination.of", {
                from: String(from),
                to: String(to),
                total: String(total),
              })}
            </span>

            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      void applyParams({ offset: Math.max(0, params.offset - params.limit) })
                    }
                    aria-disabled={currentPage <= 1}
                    className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
                {pageWindow(currentPage, totalPages).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === currentPage}
                      onClick={() => void applyParams({ offset: (p - 1) * params.limit })}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => void applyParams({ offset: params.offset + params.limit })}
                    aria-disabled={currentPage >= totalPages}
                    className={
                      currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>

      <CanonicalFiltersModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        params={params}
        onApply={(patch) => void applyParams(patch)}
        t={t}
        locale={locale}
      />

      <CanonicalFormModal
        state={formState}
        onClose={() => setFormState(null)}
        onSaved={refresh}
        t={t}
      />

      <ImportCanonicalModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refresh}
        t={t}
        locale={locale}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={t("admin.canonicalProducts.archive.title")}
        description={t("admin.canonicalProducts.archive.impact")}
        confirmLabel={t("admin.canonicalProducts.archive.confirm")}
        cancelLabel={t("admin.canonicalProducts.archive.cancel")}
        onConfirm={() => void confirmArchive()}
        busy={archiving}
        destructive
      />

      <BulkCategoryModal
        selected={bulkCategoryOpen ? [...selected] : []}
        leaves={taxonomyLeaves}
        onClose={() => setBulkCategoryOpen(false)}
        onApplied={() => {
          // La selección se vacía tras aplicar: dejarla viva invitaría a re-asignar por error
          // el mismo lote que ya se acaba de tocar.
          setSelected(new Set());
          refresh();
        }}
        t={t}
        locale={locale}
      />

      <ProvidersModal
        product={providersFor}
        onClose={() => setProvidersFor(null)}
        t={t}
        locale={locale}
      />
    </div>
  );
}

function SortableHead({
  label,
  active,
  desc,
  onToggle,
  className,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={className}
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 font-semibold"
      >
        {label}
        <svg
          viewBox="0 0 10 6"
          className={cn(
            "h-[6px] w-[10px] shrink-0",
            active ? "text-primary" : "text-muted-foreground/40",
          )}
          aria-hidden="true"
        >
          <path d={desc ? "M0 0h10L5 6z" : "M5 0l5 6H0z"} fill="currentColor" />
        </svg>
      </button>
    </TableHead>
  );
}

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
