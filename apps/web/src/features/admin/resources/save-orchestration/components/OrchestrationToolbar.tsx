import { Popover } from "@base-ui/react/popover";
import { Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui-base/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FunnelIcon } from "@/features/admin/resources/save-matching/components/toolbar-icons";
import type { MessageKey } from "@/i18n/messages";

import type { FlowFilters } from "../lib/filter-flows";
import { NEVER_RAN } from "../lib/filter-flows";

type T = (key: MessageKey) => string;

const MODES = ["manual", "automatic_chain", "cron"] as const;
const STATES = [
  NEVER_RAN,
  "queued",
  "running",
  "canceling",
  "succeeded",
  "failed",
  "canceled",
  "unknown",
] as const;

/** Centinela de "todos": `<Select>` no admite `value=""`, y `undefined` no es un valor. */
const ALL = "__all__";

// Toolbar de la consola — mismo lenguaje que Cola de revisión y Fuentes: buscador-pill a la
// izquierda con el botón de embudo en círculo lima, CTA primaria lima a la derecha.
//
// Los filtros viven en un POPOVER anclado al botón, no en un modal centrado ni en un menú:
//
//   - Un modal a pantalla completa para elegir dos opciones tapa la tabla que se está filtrando.
//   - Un `Menu` es para COMANDOS. Con los estados como ítems de radio la lista medía 12 filas y
//     cubría la tabla entera; y meterle `<Select>` a un menú pelea con su cierre por click-outside,
//     porque el popup del select se portalea FUERA del menú y cuenta como "afuera".
//
// `Popover` es la primitiva correcta para un panel con controles de formulario. Abre con
// `align="end"` para extenderse hacia la IZQUIERDA del embudo y no invadir la tabla.
export function OrchestrationToolbar({
  filters,
  onFiltersChange,
  onCreate,
  t,
}: {
  filters: FlowFilters;
  onFiltersChange: (next: FlowFilters) => void;
  onCreate: () => void;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<string>(filters.mode ?? ALL);
  const [draftState, setDraftState] = useState<string>(filters.state ?? ALL);
  const activeCount = (filters.mode ? 1 : 0) + (filters.state ? 1 : 0);

  // Al abrir, el borrador arranca de lo que está APLICADO: si el operador cerró sin aplicar, no
  // debe reencontrarse con su cambio a medias la próxima vez.
  useEffect(() => {
    if (open) {
      setDraftMode(filters.mode ?? ALL);
      setDraftState(filters.state ?? ALL);
    }
  }, [open, filters.mode, filters.state]);

  const apply = () => {
    onFiltersChange({
      ...filters,
      mode: draftMode === ALL ? undefined : draftMode,
      state: draftState === ALL ? undefined : draftState,
    });
    setOpen(false);
  };

  const reset = () => {
    setDraftMode(ALL);
    setDraftState(ALL);
    onFiltersChange({ ...filters, mode: undefined, state: undefined });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-[272px] items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 dark:border-white/10 dark:bg-white/5">
          <Search className="size-4 shrink-0 text-[#4f585d]/70 dark:text-white/50" aria-hidden="true" />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            aria-label={t("admin.orchestration.search.aria")}
            placeholder={t("admin.orchestration.search.placeholder")}
            className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none placeholder:text-[#4f585d]/60 focus-visible:ring-0 dark:placeholder:text-white/40"
          />
        </div>

        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            aria-label={t("admin.orchestration.filters")}
            className="relative flex size-9 items-center justify-center rounded-full bg-brand-lime text-brand-forest hover:bg-brand-lime/90"
          >
            <FunnelIcon className="size-[18px]" />
            {/* Con el panel cerrado, el operador no tiene cómo saber que la tabla está filtrada —
                y una tabla filtrada que parece completa es un dato falso. */}
            {activeCount > 0 ? (
              <span
                data-testid="filters-active-dot"
                // Sale del círculo por arriba-derecha en vez de apoyarse en su diagonal: ahí es
                // justo donde el glifo del embudo llega más cerca del borde y los dos se tocaban.
                className="absolute -top-2 -right-1 flex size-[18px] items-center justify-center rounded-full bg-brand-forest text-[10px] leading-none font-bold text-brand-lime ring-2 ring-muted/60 dark:ring-secondary"
              >
                {activeCount}
              </span>
            ) : null}
          </Popover.Trigger>

          <Popover.Portal>
            {/* `align="end"` = el panel se extiende hacia la IZQUIERDA del embudo. Anclado al
                inicio invadía la tabla entera. */}
            <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
              <Popover.Popup className="w-[320px] overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl ring-1 ring-border transition duration-150 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
                {/* Header con el mismo lenguaje que el modal de filtros del admin. */}
                <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-lime/25 text-brand-forest [&_svg]:size-[18px] dark:bg-brand-lime/15 dark:text-brand-lime">
                    <FunnelIcon />
                  </span>
                  <Popover.Title className="text-base font-bold text-brand-forest dark:text-brand-lime">
                    {t("admin.orchestration.filters.title")}
                  </Popover.Title>
                </div>

                <div className="border-t border-border" />

                <div className="space-y-4 px-5 py-5">
                  <FilterField label={t("admin.orchestration.filters.mode")} htmlFor="flow-filter-mode">
                    <Select value={draftMode} onValueChange={setDraftMode}>
                      <SelectTrigger id="flow-filter-mode" className="h-11! w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("admin.orchestration.filters.all")}</SelectItem>
                        {MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {t(`admin.orchestration.mode.${m}` as MessageKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label={t("admin.orchestration.filters.state")} htmlFor="flow-filter-state">
                    <Select value={draftState} onValueChange={setDraftState}>
                      <SelectTrigger id="flow-filter-state" className="h-11! w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("admin.orchestration.filters.all")}</SelectItem>
                        {STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(`admin.orchestration.state.${s}` as MessageKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                </div>

                <div className="border-t border-border" />
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                    className="gap-2 rounded-full border-border font-medium"
                  >
                    <RotateCcw className="size-4" />
                    {t("admin.orchestration.filters.clear")}
                  </Button>
                  <Button
                    type="button"
                    data-testid="filters-apply"
                    onClick={apply}
                    className="gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <FunnelIcon className="size-4" />
                    {t("admin.orchestration.filters.apply")}
                  </Button>
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("admin.orchestration.create.cta")}
      </button>
    </div>
  );
}
