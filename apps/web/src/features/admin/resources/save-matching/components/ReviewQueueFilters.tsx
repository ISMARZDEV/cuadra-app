import { ArrowUpDown, BarChart3, Settings2, Store } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import { FilterRangeSlider } from "@/features/admin/components/filters/FilterRangeSlider";
import {
  FilterSearchSelect,
  type FilterSearchSelectOption,
} from "@/features/admin/components/filters/FilterSearchSelect";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";

import { REVIEW_METHOD, REVIEW_ORDER_BY, type ReviewQueueParams } from "../types";
import { FunnelIcon } from "./toolbar-icons";

// Sentinel de radix-ui Select: no acepta `value=""` en un SelectItem — "todos" viaja como este
// string y se traduce a `undefined` al aplicar.
const ALL = "__all__";
const DEFAULT_ORDER = "uncertainty";

export interface ReviewQueueFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filtros vigentes (fuente de verdad). El draft se inicializa desde acá al abrir. */
  params: ReviewQueueParams;
  /** Se llama SOLO al pulsar "Aplicar filtros" con el patch resultante. */
  onApply: (patch: Partial<ReviewQueueParams>) => void;
  /** Lista opcional de proveedores para el combobox. Sin ella, solo aparece "Todos". */
  providers?: FilterSearchSelectOption[];
  locale: Locale;
}

interface Draft {
  provider_id: string | undefined;
  method: string | undefined;
  order_by: string;
  confidence: [number, number];
}

function draftFromParams(params: ReviewQueueParams): Draft {
  return {
    provider_id: params.provider_id,
    method: params.method,
    order_by: params.order_by ?? DEFAULT_ORDER,
    confidence: [
      Math.round((params.confidence_min ?? 0) * 100),
      Math.round((params.confidence_max ?? 1) * 100),
    ],
  };
}

const EMPTY_DRAFT: Draft = {
  provider_id: undefined,
  method: undefined,
  order_by: DEFAULT_ORDER,
  confidence: [0, 100],
};

/**
 * Modal de filtros CONCRETO de la Cola de revisión — compone la capa reutilizable
 * (`FilterModal` + `FilterField` + `FilterSearchSelect` + `FilterRangeSlider` + `Select`). Mantiene
 * un draft local y solo propaga los cambios al pulsar "Aplicar" (o los resetea con "Limpiar"),
 * como en el diseño. Sirve de referencia para armar el modal de filtros de otras tablas.
 */
export function ReviewQueueFilters({
  open,
  onOpenChange,
  params,
  onApply,
  providers = [],
  locale,
}: ReviewQueueFiltersProps) {
  const { t } = useAdminI18n(locale);
  const [draft, setDraft] = useState<Draft>(() => draftFromParams(params));

  // Sincroniza el draft con los params vigentes cada vez que se abre el modal.
  useEffect(() => {
    if (open) setDraft(draftFromParams(params));
  }, [open, params]);

  function apply() {
    const [lo, hi] = draft.confidence;
    onApply({
      provider_id: draft.provider_id,
      method: draft.method,
      order_by: draft.order_by,
      confidence_min: lo <= 0 ? undefined : lo / 100,
      confidence_max: hi >= 100 ? undefined : hi / 100,
    });
    onOpenChange(false);
  }

  return (
    <FilterModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.toolbar.filters")}
      icon={<FunnelIcon />}
      onClear={() => setDraft(EMPTY_DRAFT)}
      onApply={apply}
      clearLabel={t("admin.toolbar.filters.clear")}
      applyLabel={t("admin.toolbar.filters.apply")}
      applyIcon={<FunnelIcon className="size-4" />}
    >
      {/* Proveedor (fila completa) */}
      <FilterField icon={<Store />} label={t("admin.toolbar.filter.provider")} htmlFor="filter-provider">
        <FilterSearchSelect
          id="filter-provider"
          value={draft.provider_id}
          onChange={(v) => setDraft((d) => ({ ...d, provider_id: v }))}
          options={providers}
          placeholder={t("admin.toolbar.filter.provider.placeholder")}
          allLabel={t("admin.toolbar.filter.provider.all")}
        />
      </FilterField>

      {/* Método + Orden (dos columnas) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FilterField icon={<Settings2 />} label={t("admin.toolbar.filter.method")}>
          <Select
            value={draft.method ?? ALL}
            onValueChange={(v) => setDraft((d) => ({ ...d, method: v === ALL ? undefined : v }))}
          >
            <SelectTrigger className="h-11! w-full rounded-xl">
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
        </FilterField>

        <FilterField icon={<ArrowUpDown />} label={t("admin.toolbar.filter.orderBy")}>
          <Select
            value={draft.order_by}
            onValueChange={(v) => setDraft((d) => ({ ...d, order_by: v }))}
          >
            <SelectTrigger className="h-11! w-full rounded-xl">
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
        </FilterField>
      </div>

      {/* Confianza (%) — rango (fila completa) */}
      <FilterField icon={<BarChart3 />} label={t("admin.toolbar.filter.confidence")}>
        <FilterRangeSlider
          value={draft.confidence}
          onChange={(v) => setDraft((d) => ({ ...d, confidence: v }))}
          minLabel={t("admin.toolbar.filter.confidence.min")}
          maxLabel={t("admin.toolbar.filter.confidence.max")}
          ticks={[0, 25, 50, 75, 100]}
        />
      </FilterField>
    </FilterModal>
  );
}
