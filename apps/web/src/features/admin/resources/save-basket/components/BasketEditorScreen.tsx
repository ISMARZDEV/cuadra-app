import type { BasketQueryDto } from "@cuadra/api-client";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, Info, ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useData } from "vike-react/useData";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import { useAdminList } from "@/features/admin/shell/use-admin-list";

import {
  createBasketQueryEntry,
  listBasketQueryEntries,
  removeBasketQueryEntry,
  updateBasketQueryEntry,
} from "../api";
import { reorderPositions } from "../lib/reorder";
import type { BasketQueriesData } from "../interfaces";
import { DEFAULT_BASKET_MARKET } from "../types";
import { BasketRow } from "./BasketRow";
import { BasketQueryModal } from "./BasketQueryModal";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
type SortState = "asc" | "desc" | "none";
type ModalState = { mode: "add" } | { mode: "edit"; entry: BasketQueryDto } | null;

// Editor de la canasta curada (F2 rebuild, fiel al módulo Cola de Revisión / save-matching): misma
// card contenedora `rounded-[32px]`, buscador-pill + modal estilo-filtros (FilterModal), checkboxes
// de selección + acciones en bloque, headers ordenables y paginación (todo CLIENT-SIDE — la lista
// llega entera vía `listBasketQueries`, no hay paginación de backend). Sin TanStack Query —
// `useAdminList` refresca tras cada mutación.
export function BasketEditorScreen() {
  const { entries: initialEntries } = useData<BasketQueriesData>();
  const { items: entries, refresh } = useAdminList(initialEntries, () =>
    listBasketQueryEntries(DEFAULT_BASKET_MARKET),
  );

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortState>("none");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? entries.filter((e) =>
        `${e.query_text} ${e.category_label ?? ""}`.toLowerCase().includes(needle),
      )
    : entries;

  const sorted = sortCol && sortDir !== "none" ? [...filtered].sort(comparatorFor(sortCol, sortDir)) : filtered;

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const pageRows = sorted.slice(offset, offset + limit);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(limit)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, limit].sort((a, b) => a - b);

  // Cualquier cambio de filtro/orden/tamaño vuelve a la página 1 (evita quedar en una página vacía).
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

  const pageIds = pageRows.map((r) => r.id);
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

  const moveByIndex = async (id: string, dir: -1 | 1) => {
    const idx = entries.findIndex((e) => e.id === id);
    const other = entries[idx + dir];
    if (!other) return;
    const current = entries[idx];
    await updateBasketQueryEntry(current.id, { position: other.position });
    await updateBasketQueryEntry(other.id, { position: current.position });
    await refresh();
  };

  const onBulkDelete = async () => {
    setBusyBulk(true);
    await Promise.all(Array.from(selected).map((id) => removeBasketQueryEntry(id)));
    setBusyBulk(false);
    setConfirmingBulk(false);
    setSelected(new Set());
    await refresh();
  };

  // Drag-and-drop (@dnd-kit) — deshabilitado si hay orden por columna o búsqueda activa (las filas
  // no están en orden natural de `position`). Los botones ↑/↓ quedan como fallback accesible.
  const dragDisabled = sortCol !== null || needle !== "";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const patches = reorderPositions(entries, String(active.id), String(over.id));
    if (patches.length === 0) return;
    await Promise.all(patches.map((p) => updateBasketQueryEntry(p.id, { position: p.position })));
    await refresh();
  };

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">Canasta curada</h1>
          <Info
            className="size-4 text-muted-foreground"
            aria-label={`Términos que la ingesta usa para armar la canasta (mercado ${DEFAULT_BASKET_MARKET}).`}
            role="img"
          />
          <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">({entries.length})</span>
        </div>

        {/* Toolbar: buscador-pill (izq) + Acciones bulk + Agregar (der) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 dark:border-white/10 dark:bg-white/5">
            <Search className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en la canasta"
              placeholder="Buscar query o categoría…"
              className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
            />
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
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmingBulk(true)}>
                  <Trash2 />
                  Eliminar ({selected.size})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setModal({ mode: "add" })}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar query
            </button>
          </div>
        </div>

        {confirmingBulk ? (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <span className="text-destructive">¿Eliminar {selected.size} queries de la canasta?</span>
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => void onBulkDelete()}
              className="rounded-full bg-destructive px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              Confirmar eliminar ({selected.size})
            </button>
            <button type="button" onClick={() => setConfirmingBulk(false)} className="text-muted-foreground">
              Cancelar
            </button>
          </div>
        ) : null}

        {/* Tabla */}
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                <TableHead className="w-10">
                  <SelectCheckbox
                    data-testid="select-all"
                    aria-label="Seleccionar todas"
                    checked={allPageSelected}
                    disabled={pageIds.length === 0}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-20">#</TableHead>
                <SortableHeader label="Query" state={sortStateFor("query")} onToggle={() => toggleSort("query")} />
                <SortableHeader label="Categoría" state={sortStateFor("category")} onToggle={() => toggleSort("category")} />
                <SortableHeader label="Estado" state={sortStateFor("status")} onToggle={() => toggleSort("status")} />
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
                {pageRows.map((row) => {
                  const idx = entries.findIndex((e) => e.id === row.id);
                  return (
                    <BasketRow
                      key={row.id}
                      entry={row}
                      selected={selected.has(row.id)}
                      onToggleSelect={() => toggleSelect(row.id)}
                      isFirst={idx === 0}
                      isLast={idx === entries.length - 1}
                      onMoveUp={() => moveByIndex(row.id, -1)}
                      onMoveDown={() => moveByIndex(row.id, 1)}
                      onEdit={() => setModal({ mode: "edit", entry: row })}
                      refresh={refresh}
                      dragDisabled={dragDisabled}
                    />
                  );
                })}
              </SortableContext>
            </TableBody>
          </Table>
          </DndContext>

          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Sin queries todavía.</p>
          ) : total === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Sin resultados para esa búsqueda.</p>
          ) : null}

          {/* Footer: page-size + rango + paginación */}
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
        </div>
      </div>

      {modal ? (
        <BasketQueryModal
          state={modal}
          onClose={() => setModal(null)}
          refresh={refresh}
        />
      ) : null}
    </div>
  );
}

// Comparador client-side por columna (la lista llega entera). `status` ordena por `active`.
function comparatorFor(col: string, dir: SortState) {
  const sign = dir === "desc" ? -1 : 1;
  return (a: BasketQueryDto, b: BasketQueryDto): number => {
    let cmp = 0;
    if (col === "query") cmp = a.query_text.localeCompare(b.query_text);
    else if (col === "category") cmp = (a.category_label ?? "").localeCompare(b.category_label ?? "");
    else if (col === "status") cmp = Number(a.active) - Number(b.active);
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
