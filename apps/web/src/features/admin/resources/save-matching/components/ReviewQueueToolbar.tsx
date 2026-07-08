import { ChevronDown, Filter, LayoutGrid, List, Search, Share2, SquareCheckBig, Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui-base/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";

import { REVIEW_METHOD, REVIEW_ORDER_BY, type ReviewQueueParams } from "../types";

// Sentinel de radix-ui Select: no acepta `value=""` en un SelectItem (mismo patrón que
// `ReviewQueueListScreen` hoy) — "todos" viaja como este string y se traduce a `undefined` al
// llamar `onParamsChange`.
const ALL = "__all__";

export type ReviewQueueView = "list" | "grid";

export interface ReviewQueueToolbarProps {
  /** Filtros/orden/paginación vigentes (misma fuente que `ReviewQueueListScreen`). Los controles
   * del panel de filtros leen de acá y escriben vía `onParamsChange` — el caller (Batch 6) decide
   * si eso navega por URL (`navigateWith`) u otra cosa. */
  params: ReviewQueueParams;
  onParamsChange: (patch: Partial<ReviewQueueParams>) => void;
  /** Texto de búsqueda (⌘F). NO hay parámetro de texto en el backend todavía — el caller (Batch 6)
   * hace el filtro CLIENT-SIDE sobre `rows` ya cargadas (por nombre de producto). Este componente
   * solo surfacea el valor, no filtra nada. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Vista de la tabla: "list" es la real (tabla); "grid" es un STUB deshabilitado (follow-up,
   * ver Fase 2 del SDD — "Grid/list: solo tabla/list por ahora"). */
  view: ReviewQueueView;
  onViewChange: (view: ReviewQueueView) => void;
  /** Nº de filas seleccionadas (bulk actions) — deshabilita el dropdown "Acciones" en 0. */
  selectedCount: number;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  bulkBusy?: boolean;
  /** Locale explícito (SSR admin, ver `useAdminI18n`). */
  locale: Locale;
}

// Toolbar de la Cola de revisión (Figma 483:12411, Batch 5): cluster izquierdo = búsqueda + filtros
// + view-toggle; cluster derecho = exportar (stub) + "Mostrar todos" (stub) + "Acciones" (bulk
// approve/reject real). Presentacional — el estado vive en el screen (Batch 6 lo integra); acá solo
// wireamos vía props/callbacks para poder testear en aislamiento.
export function ReviewQueueToolbar({
  params,
  onParamsChange,
  search,
  onSearchChange,
  view,
  onViewChange,
  selectedCount,
  onBulkApprove,
  onBulkReject,
  bulkBusy,
  locale,
}: ReviewQueueToolbarProps) {
  const { t } = useAdminI18n(locale);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Búsqueda: pill redondeado, ícono lupa, hint ⌘F. Client-side-only (ver doc del prop
            `search` arriba) — Batch 6 filtra `rows` por nombre con este valor. */}
        <div className="relative flex h-9 w-64 items-center rounded-full border border-primary/30 bg-primary/10 pr-2 pl-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("admin.toolbar.search.placeholder")}
            className="h-full border-none bg-transparent px-2 shadow-none focus-visible:ring-0"
          />
          <span
            className="pointer-events-none shrink-0 rounded-md bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            aria-hidden="true"
          >
            ⌘F
          </span>
        </div>

        {/* Filtros: botón redondo (funnel) que abre el panel con los controles YA existentes
            (provider/method/confidence/order_by) — movidos acá desde `ReviewQueueListScreen`. */}
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full border-primary/40 text-primary"
            aria-label={t("admin.toolbar.filters")}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <Filter className="size-4" />
          </Button>

          {filtersOpen ? (
            <div
              className="absolute top-full left-0 z-20 mt-2 flex w-80 flex-wrap items-end gap-3 rounded-md border border-border bg-popover p-3 shadow-md"
              data-testid="review-queue-filters-panel"
            >
              <div>
                <label htmlFor="toolbar-provider-filter" className="mb-1 block text-xs text-muted-foreground">
                  {t("admin.toolbar.filter.provider")}
                </label>
                <Input
                  id="toolbar-provider-filter"
                  defaultValue={params.provider_id ?? ""}
                  className="w-40"
                  onBlur={(e) =>
                    onParamsChange({ provider_id: e.target.value.trim() || undefined })
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("admin.toolbar.filter.method")}
                </label>
                <Select
                  value={params.method ?? ALL}
                  onValueChange={(v) => onParamsChange({ method: v === ALL ? undefined : v })}
                >
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("admin.toolbar.filter.method.all")}</SelectItem>
                    {REVIEW_METHOD.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="toolbar-confidence-min" className="mb-1 block text-xs text-muted-foreground">
                  {t("admin.toolbar.filter.confidenceMin")}
                </label>
                <Input
                  id="toolbar-confidence-min"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={params.confidence_min ?? ""}
                  className="w-24"
                  onBlur={(e) =>
                    onParamsChange({
                      confidence_min: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div>
                <label htmlFor="toolbar-confidence-max" className="mb-1 block text-xs text-muted-foreground">
                  {t("admin.toolbar.filter.confidenceMax")}
                </label>
                <Input
                  id="toolbar-confidence-max"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={params.confidence_max ?? ""}
                  className="w-24"
                  onBlur={(e) =>
                    onParamsChange({
                      confidence_max: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("admin.toolbar.filter.orderBy")}
                </label>
                <Select
                  value={params.order_by}
                  onValueChange={(v) => onParamsChange({ order_by: v })}
                >
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_ORDER_BY.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o === "uncertainty"
                          ? t("admin.toolbar.filter.orderBy.uncertainty")
                          : t("admin.toolbar.filter.orderBy.createdAt")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        {/* View-toggle: list = real (tabla); grid = stub deshabilitado (follow-up). */}
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => {
            if (v === "list" || v === "grid") onViewChange(v);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="grid" disabled aria-label={t("admin.toolbar.view.grid")}>
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t("admin.toolbar.view.list")}>
            <List className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Exportar: STUB — sin endpoint todavía, deshabilitado a propósito (follow-up). */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full border-primary/40 text-primary"
          aria-label={t("admin.toolbar.export")}
          disabled
        >
          <Share2 className="size-4" />
        </Button>

        {/* "Mostrar todos": STUB — no hay flag de backend limpio para esto todavía; dropdown
            presentacional con opciones localizadas, sin efecto (documentado, follow-up). */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary">
            <Star className="size-4" />
            {t("admin.toolbar.showAll")}
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>{t("admin.toolbar.showAll.optionAll")}</DropdownMenuItem>
            <DropdownMenuItem>{t("admin.toolbar.showAll.optionUncertain")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* "Acciones": bulk approve/reject reales (misma lógica que el screen hoy) — deshabilitado
            sin selección. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={selectedCount === 0 || bulkBusy}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <SquareCheckBig className="size-4" />
            {t("admin.toolbar.actions")}
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onBulkApprove}>
              {t("admin.toolbar.actions.approve")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onBulkReject}>
              {t("admin.toolbar.actions.reject")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
