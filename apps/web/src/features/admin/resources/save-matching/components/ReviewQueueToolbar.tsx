import { CheckCheck, ChevronDown, LayoutGrid, List, PackagePlus, Search, Tags, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui-base/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { FilterSearchSelectOption } from "@/features/admin/components/filters/FilterSearchSelect";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import type { ReviewQueueParams } from "../types";
import { ReviewQueueFilters } from "./ReviewQueueFilters";
import { FunnelIcon, ListChecksIcon, ListStarIcon } from "./toolbar-icons";

export type ReviewQueueView = "list" | "grid";

export interface ReviewQueueToolbarProps {
  /** Filtros/orden/paginación vigentes (misma fuente que `ReviewQueueListScreen`). Los controles
   * del panel de filtros leen de acá y escriben vía `onParamsChange` — el caller (Batch 6) decide
   * si eso navega por URL (`navigateWith`) u otra cosa. */
  params: ReviewQueueParams;
  onParamsChange: (patch: Partial<ReviewQueueParams>) => void;
  /** Lista opcional de proveedores para el combobox del modal de filtros. */
  providers?: FilterSearchSelectOption[];
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
  /** ¿Hay al menos una fila seleccionada CON candidatos? "Aprobar" enlaza al candidato top: sobre
   * una selección entera sin candidatos no puede hacer nada. */
  hasCandidatesSelected?: boolean;
  onBulkReject: () => void;
  /** Clasifica en lote lo seleccionado (llena la categoría, precondición para canonizar). */
  onBulkClassify: () => void;
  /** Crea canónicos NUEVOS a partir de lo seleccionado. Es la acción que sirve cuando no hay
   *  candidatos a los que enlazar — el caso normal en un catálogo en arranque en frío. */
  onBulkCanonize: () => void;
  bulkBusy?: boolean;
  /** Locale explícito (SSR admin, ver `useAdminI18n`). */
  locale: Locale;
}

// Chip redondo del view-toggle (grid/list) dentro de un pill BLANCO. Seleccionado = círculo lima
// (brand-lime) con ícono oscuro; sin seleccionar = círculo gris SÓLIDO con ícono oscuro. El ícono
// usa el token Dark (#1e2129) del Figma en ambos estados. Fiel a la referencia (Select-Type-View).
const VIEW_CHIP_BASE =
  "flex size-[26px] items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed";
const VIEW_CHIP_ON = "bg-brand-lime text-[#1e2129]";
const VIEW_CHIP_OFF = "bg-[#d9d9d9] text-[#1e2129] dark:bg-white/20 dark:text-white/85";

// Toolbar de la Cola de revisión (Figma 551:16671): cluster izquierdo = búsqueda (pill gris + hint
// ⌘F verde bosque) + filtros (círculo lima) + view-toggle (pastilla gris con chips grid/list);
// cluster derecho = "Mostrar todos" (lima, stub) + "Acciones" (verde bosque, bulk approve/reject
// real). Presentacional — el estado vive en el screen; acá solo wireamos vía props/callbacks.
export function ReviewQueueToolbar({
  params,
  onParamsChange,
  providers,
  search,
  onSearchChange,
  view,
  onViewChange,
  selectedCount,
  onBulkApprove,
  hasCandidatesSelected = true,
  onBulkReject,
  onBulkClassify,
  onBulkCanonize,
  bulkBusy,
  locale,
}: ReviewQueueToolbarProps) {
  const { t } = useAdminI18n(locale);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Búsqueda: pill gris neutro, ícono lupa, hint ⌘F en pastilla verde bosque. Client-side-only
            (ver doc del prop `search`) — Batch 6 filtra `rows` por nombre con este valor. */}
        <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 dark:border-white/10 dark:bg-white/5">
          <Search className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("admin.toolbar.search.placeholder")}
            className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
          />
          <span
            className="pointer-events-none shrink-0 rounded-l-[5px] rounded-r-full bg-brand-forest px-2 py-1 text-[11px] font-medium text-[#f4f3f3]"
            aria-hidden="true"
          >
            ⌘F
          </span>
        </div>

        {/* Filtros: círculo lima con embudo verde bosque (duotono) que abre el MODAL de filtros
            reutilizable (provider/method/confidence/order_by) con apply diferido. */}
        <Button
          type="button"
          size="icon"
          className="size-9 rounded-full border-transparent bg-brand-lime text-brand-forest shadow-none hover:bg-brand-lime/90"
          aria-label={t("admin.toolbar.filters")}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(true)}
        >
          <FunnelIcon className="size-[18px]" />
        </Button>
        <ReviewQueueFilters
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          params={params}
          onApply={onParamsChange}
          providers={providers}
          locale={locale}
        />

        {/* View-toggle: pastilla gris con dos chips redondos. list = real (chip lima); grid = stub
            deshabilitado (chip gris). Semántica radiogroup/radio para accesibilidad + tests. */}
        <div role="radiogroup" className="flex items-center gap-1.5 rounded-full bg-white p-1 dark:bg-white/10">
          <button
            type="button"
            role="radio"
            aria-checked={view === "grid"}
            aria-label={t("admin.toolbar.view.grid")}
            disabled
            className={cn(VIEW_CHIP_BASE, view === "grid" ? VIEW_CHIP_ON : VIEW_CHIP_OFF)}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={view === "list"}
            aria-label={t("admin.toolbar.view.list")}
            onClick={() => onViewChange("list")}
            className={cn(VIEW_CHIP_BASE, view === "list" ? VIEW_CHIP_ON : VIEW_CHIP_OFF)}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {/* Orden del cluster derecho: contador → Acciones → Mostrar todos. Es el MISMO que el de
          Orquestación (contador → Acciones → Nuevo flujo), y no es simetría por simetría: lo que
          opera sobre la SELECCIÓN va junto al número de filas seleccionadas, y lo que cambia el
          alcance de la vista queda después. Antes "Mostrar todos" se metía entre el contador y su
          propio botón. */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Contador PEGADO al botón que actúa sobre esa selección. Vivía debajo de la tabla, a media
            pantalla del menú: al abrir "Aprobar seleccionados" el número ya no estaba a la vista, y
            una acción en lote sin saber sobre cuántas filas aplica es la que no se debe ofrecer. */}
        {selectedCount > 0 ? (
          <span
            data-testid="review-selected-count"
            className="text-xs font-medium text-muted-foreground"
          >
            {selectedCount} {t("admin.reviewQueue.selectedSuffix")}
          </span>
        ) : null}

        {/* "Acciones": bulk approve/reject reales — deshabilitado sin selección. Pill verde bosque
            con ícono list-checks (duotono) y texto lima. Los ítems llevan los MISMOS íconos y
            colores que el menú de fila: es la misma acción sobre varias filas, y otro aspecto haría
            dudar de si hace lo mismo. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={selectedCount === 0 || bulkBusy}
            className="flex h-9 items-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime disabled:opacity-50"
          >
            <ListChecksIcon className="size-[18px]" />
            {t("admin.toolbar.actions")}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          {/* `align="end"` + `min-w-56` + `nowrap`: EXACTAMENTE lo mismo que el menú de lote de
              Orquestación, y no por simetría estética sino porque sin eso el menú medía 139px, los
              ítems se partían en dos líneas (52px de alto en vez de 32) y el panel se desbordaba
              hacia la derecha de la tabla. Medido, no supuesto. */}
          <DropdownMenuContent align="end" className="min-w-56 [&_[role=menuitem]]:whitespace-nowrap">
            {/* PREPARAR primero: clasificar no decide nada sobre el match, sólo le pone la
                categoría — que es la precondición para poder canonizar después. `Tags` y no
                `Sparkles`: no todo el trabajo lo hace un LLM (el léxico y la señal de origen son
                deterministas), y vender magia donde hay reglas sería mentir sobre el sistema. */}
            <DropdownMenuItem
              onClick={onBulkClassify}
              className="focus:bg-violet-500/10 focus:text-violet-600 not-data-[variant=destructive]:focus:**:text-violet-600 dark:focus:text-violet-400 dark:not-data-[variant=destructive]:focus:**:text-violet-400"
            >
              <Tags className="text-violet-600 dark:text-violet-400" />
              {t("admin.toolbar.actions.classify")}
            </DropdownMenuItem>

            {/* El separador agrupa por TIPO DE ACTO: preparar · decidir · destruir. Sin él las
                cuatro acciones se leen como intercambiables, y una de ellas borra. */}
            <DropdownMenuSeparator />

            {/* Deshabilitado cuando NINGUNA fila seleccionada tiene candidatos: enlazar al
                candidato top es imposible sin candidatos, y ofrecerlo devolvía una lista de fallos
                por cada fila. El `title` dice por qué, y a dónde ir en su lugar. */}
            <DropdownMenuItem
              disabled={!hasCandidatesSelected}
              title={
                hasCandidatesSelected ? undefined : t("admin.toolbar.actions.approve.noCandidates")
              }
              onClick={onBulkApprove}
              className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
            >
              {/* `CheckCheck` (doble tilde) y no `Check`: es la acción sobre VARIAS filas, y el
                  glifo lo dice sin leer. El simple queda para el aprobar de una sola. */}
              <CheckCheck className="text-emerald-600 dark:text-emerald-400" />
              {t("admin.toolbar.actions.approve")}
            </DropdownMenuItem>
            {/* Crear canónicos: NO se deshabilita por candidatos — justamente sirve cuando NO
                los hay. `PackagePlus`: nace una entrada nueva en el catálogo maestro. */}
            <DropdownMenuItem
              onClick={onBulkCanonize}
              className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
            >
              <PackagePlus className="text-emerald-600 dark:text-emerald-400" />
              {t("admin.toolbar.actions.canonize")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={onBulkReject}>
              <X />
              {t("admin.toolbar.actions.reject")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* "Mostrar todos": STUB — dropdown presentacional, sin efecto (follow-up). Pill lima con
            ícono lista+estrella (duotono) y texto verde bosque. */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest">
            <ListStarIcon className="size-[18px]" />
            {t("admin.toolbar.showAll")}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t("admin.toolbar.showAll.optionAll")}</DropdownMenuItem>
            <DropdownMenuItem>{t("admin.toolbar.showAll.optionUncertain")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
