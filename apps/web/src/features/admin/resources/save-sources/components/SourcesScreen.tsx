import type { SourceHealthDto } from "@cuadra/api-client";
import { ChevronDown, LayoutGrid, List, ListChecks, Play, Plus, Power, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useData } from "vike-react/useData";

import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import { useAdminList } from "@/features/admin/shell/use-admin-list";

import { listSourcesHealthEntries, pauseSourceConfig, resumeSourceConfig } from "../api";
import type { SourcesData } from "../interfaces";
import { SourceCard } from "./SourceCard";
import { SourceModal, type SourceModalState } from "./SourceModal";
import { SourceRow } from "./SourceRow";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
type SortState = "asc" | "desc" | "none";
type ViewMode = "list" | "grid";

const VIEW_CHIP_BASE =
  "flex size-[26px] items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed";
const VIEW_CHIP_ON = "bg-brand-lime text-[#1e2129]";
const VIEW_CHIP_OFF = "bg-[#d9d9d9] text-[#1e2129] dark:bg-white/20 dark:text-white/85";

// Consola de Fuentes (rediseño fiel a la Canasta curada): contenedor `rounded-[32px]`, buscador-pill,
// botón Acciones (pausar/reanudar en bloque) + Agregar proveedor (modal alta/edición con auth tipado),
// tabla con headers ordenables + paginación. Sin TanStack Query — `useAdminList` refresca tras mutar.
export function SourcesScreen() {
  const { sources: initialSources, providers } = useData<SourcesData>();
  const { items: sources, refresh } = useAdminList(initialSources, () => listSourcesHealthEntries());

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [modal, setModal] = useState<SourceModalState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortState>("none");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [busyBulk, setBusyBulk] = useState(false);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? sources.filter((s) => `${s.platform} ${s.base_url}`.toLowerCase().includes(needle)) : sources),
    [sources, needle],
  );
  const sorted = useMemo(
    () => (sortCol && sortDir !== "none" ? [...filtered].sort(comparatorFor(sortCol, sortDir)) : filtered),
    [filtered, sortCol, sortDir],
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const pageRows = useMemo(() => sorted.slice(offset, offset + limit), [sorted, offset, limit]);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(limit) ? PAGE_SIZE_OPTIONS : [...PAGE_SIZE_OPTIONS, limit].sort((a, b) => a - b);

  useEffect(() => {
    setOffset(0);
  }, [needle, sortCol, sortDir, limit]);

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
      next.has(id) ? next.delete(id) : next.add(id);
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

  const onBulk = async (action: "pause" | "resume") => {
    setBusyBulk(true);
    await Promise.all(
      Array.from(selected).map((id) => (action === "pause" ? pauseSourceConfig(id) : resumeSourceConfig(id))),
    );
    setBusyBulk(false);
    setSelected(new Set());
    await refresh();
  };

  const emptyStateEl =
    sources.length === 0 ? (
      <p className="px-4 py-6 text-sm text-muted-foreground">Sin fuentes todavía.</p>
    ) : total === 0 ? (
      <p className="px-4 py-6 text-sm text-muted-foreground">Sin resultados para esa búsqueda.</p>
    ) : null;

  const footerEl = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Mostrar</span>
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
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
        <span>por página</span>
      </div>

      <span>
        {from}–{to} de {total}
      </span>

      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => setOffset(Math.max(0, offset - limit))}
              aria-disabled={currentPage <= 1}
              className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {pageWindow(currentPage, totalPages).map((p) => (
            <PaginationItem key={p}>
              <PaginationLink isActive={p === currentPage} onClick={() => setOffset((p - 1) * limit)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              onClick={() => setOffset(offset + limit)}
              aria-disabled={currentPage >= totalPages}
              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">Fuentes (Save)</h1>
          <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">({sources.length})</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Configuración de extracción por proveedor. La auth (Bearer / API key) vive cifrada en la fuente y
          se muestra enmascarada. "Probar" es una vista previa — no guarda nada.
        </p>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 dark:border-white/10 dark:bg-white/5">
              <Search className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50" aria-hidden="true" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar fuentes"
                placeholder="Buscar por plataforma o URL…"
                className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
              />
            </div>

            {/* Toggle grid/lista — igual al de Cola de revisión */}
            <div role="radiogroup" className="flex items-center gap-1.5 rounded-full bg-white p-1 dark:bg-white/10">
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "grid"}
                aria-label="Ver en cards"
                onClick={() => setViewMode("grid")}
                className={cn(VIEW_CHIP_BASE, viewMode === "grid" ? VIEW_CHIP_ON : VIEW_CHIP_OFF)}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "list"}
                aria-label="Ver en lista"
                onClick={() => setViewMode("list")}
                className={cn(VIEW_CHIP_BASE, viewMode === "list" ? VIEW_CHIP_ON : VIEW_CHIP_OFF)}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={selected.size === 0 || busyBulk}
                className="flex h-9 items-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime disabled:opacity-50"
              >
                <ListChecks className="size-[18px]" />
                Acciones
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => void onBulk("pause")}>
                  <Power />
                  Pausar seleccionadas ({selected.size})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onBulk("resume")}>
                  <Play />
                  Reanudar seleccionadas ({selected.size})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setModal({ mode: "add" })}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar proveedor
            </button>
          </div>
        </div>

        {/* Vista GRID (cards) o LISTA (tabla) según el toggle */}
        {viewMode === "grid" ? (
          <div className="space-y-4">
            {pageRows.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pageRows.map((row) => (
                  <SourceCard
                    key={row.id}
                    source={row}
                    selected={selected.has(row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onEdit={() => setModal({ mode: "edit", source: row })}
                    refresh={refresh}
                  />
                ))}
              </div>
            ) : null}
            {emptyStateEl}
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
              {footerEl}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                  <TableHead className="w-10">
                    <SelectCheckbox
                      data-testid="select-all"
                      aria-label="Seleccionar todo"
                      checked={allPageSelected}
                      disabled={pageIds.length === 0}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <SortableHeader label="Salud" state={sortStateFor("health")} onToggle={() => toggleSort("health")} />
                  <TableHead className="w-16">Logo</TableHead>
                  <SortableHeader label="Plataforma" state={sortStateFor("platform")} onToggle={() => toggleSort("platform")} />
                  <SortableHeader label="Base URL" state={sortStateFor("url")} onToggle={() => toggleSort("url")} />
                  <SortableHeader label="Productos" state={sortStateFor("count")} onToggle={() => toggleSort("count")} />
                  <SortableHeader label="Última actualización" state={sortStateFor("last_seen")} onToggle={() => toggleSort("last_seen")} />
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <SourceRow
                    key={row.id}
                    source={row}
                    selected={selected.has(row.id)}
                    onToggleSelect={() => toggleSelect(row.id)}
                    onEdit={() => setModal({ mode: "edit", source: row })}
                    refresh={refresh}
                  />
                ))}
              </TableBody>
            </Table>
            {emptyStateEl}
            {footerEl}
          </div>
        )}
      </div>

      {modal ? (
        <SourceModal state={modal} providers={providers} onClose={() => setModal(null)} refresh={refresh} />
      ) : null}
    </div>
  );
}

// `last_seen_at` → epoch ms; null (nunca ingerido) = 0, el más viejo (queda primero en asc).
function tsOf(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function comparatorFor(col: string, dir: SortState) {
  const sign = dir === "desc" ? -1 : 1;
  return (a: SourceHealthDto, b: SourceHealthDto): number => {
    let cmp = 0;
    if (col === "platform") cmp = a.platform.localeCompare(b.platform);
    else if (col === "url") cmp = a.base_url.localeCompare(b.base_url);
    else if (col === "health") cmp = a.health.localeCompare(b.health);
    else if (col === "count") cmp = (a.product_count ?? 0) - (b.product_count ?? 0);
    else if (col === "last_seen") cmp = tsOf(a.last_seen_at) - tsOf(b.last_seen_at);
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

function SortableHeader({ label, state, onToggle }: { label: ReactNode; state: SortState; onToggle: () => void }) {
  return (
    <TableHead aria-sort={ARIA_SORT[state]}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 font-semibold">
        {label}
        <SortTriangle state={state} />
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
