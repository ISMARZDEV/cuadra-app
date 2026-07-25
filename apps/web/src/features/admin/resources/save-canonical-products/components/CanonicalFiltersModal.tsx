import { Barcode, Filter, Layers, Store } from "lucide-react";
import { useEffect, useState } from "react";

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
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import type { CanonicalProductsParams } from "../lib/canonical-products-params";
import { QUALITY_LABEL_KEY, QUALITY_STATUSES } from "../lib/quality-status";

const ALL = "all";

interface CanonicalFiltersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: CanonicalProductsParams;
  onApply: (patch: Partial<CanonicalProductsParams>) => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

// Filtros del catálogo en el MISMO shell que el resto del admin (`FilterModal`), no como selects
// sueltos en la pantalla. Trabaja sobre un DRAFT: nada se aplica hasta tocar "Aplicar", así el
// operador puede armar la combinación completa sin disparar una consulta por cada cambio.
export function CanonicalFiltersModal({
  open,
  onOpenChange,
  params,
  onApply,
  t,
}: CanonicalFiltersModalProps) {
  const [quality, setQuality] = useState(params.quality_status ?? ALL);
  const [ean, setEan] = useState(
    params.ean_reachable === undefined ? ALL : String(params.ean_reachable),
  );
  const [minProviders, setMinProviders] = useState(
    params.min_provider_count === undefined ? "" : String(params.min_provider_count),
  );
  const [updatedSince, setUpdatedSince] = useState(params.updated_since ?? "");

  // Al reabrir, el draft se re-siembra desde la URL: si no, el modal mostraría los filtros de la
  // última vez que se abrió y no los que están REALMENTE aplicados.
  useEffect(() => {
    if (!open) return;
    setQuality(params.quality_status ?? ALL);
    setEan(params.ean_reachable === undefined ? ALL : String(params.ean_reachable));
    setMinProviders(
      params.min_provider_count === undefined ? "" : String(params.min_provider_count),
    );
    setUpdatedSince(params.updated_since ?? "");
  }, [open, params]);

  const clear = () => {
    setQuality(ALL);
    setEan(ALL);
    setMinProviders("");
    setUpdatedSince("");
  };

  const apply = () => {
    const parsedMin = Number(minProviders);
    onApply({
      quality_status: quality === ALL ? undefined : quality,
      ean_reachable: ean === ALL ? undefined : ean === "true",
      min_provider_count:
        minProviders.trim() !== "" && Number.isFinite(parsedMin) && parsedMin >= 0
          ? Math.floor(parsedMin)
          : undefined,
      updated_since: updatedSince || undefined,
    });
    onOpenChange(false);
  };

  return (
    <FilterModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.canonicalProducts.filters.title")}
      icon={<Filter className="size-[18px]" />}
      onClear={clear}
      onApply={apply}
      clearLabel={t("admin.canonicalProducts.filters.clear")}
      applyLabel={t("admin.canonicalProducts.filters.apply")}
      applyIcon={<Filter className="size-4" />}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FilterField
          icon={<Layers />}
          label={t("admin.canonicalProducts.filters.quality")}
          htmlFor="cp-filter-quality"
        >
          <Select value={quality} onValueChange={setQuality}>
            <SelectTrigger id="cp-filter-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.canonicalProducts.filters.all")}</SelectItem>
              {QUALITY_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(QUALITY_LABEL_KEY[status])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField
          icon={<Barcode />}
          label={t("admin.canonicalProducts.filters.ean")}
          htmlFor="cp-filter-ean"
        >
          <Select value={ean} onValueChange={setEan}>
            <SelectTrigger id="cp-filter-ean">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("admin.canonicalProducts.filters.all")}</SelectItem>
              <SelectItem value="true">{t("admin.canonicalProducts.filters.eanYes")}</SelectItem>
              <SelectItem value="false">{t("admin.canonicalProducts.filters.eanNo")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField
          icon={<Store />}
          label={t("admin.canonicalProducts.filters.minProviders")}
          htmlFor="cp-filter-min-providers"
        >
          <Input
            id="cp-filter-min-providers"
            type="number"
            min={0}
            value={minProviders}
            onChange={(e) => setMinProviders(e.target.value)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            {t("admin.canonicalProducts.filters.minProvidersHint")}
          </p>
        </FilterField>

        <FilterField
          icon={<Layers />}
          label={t("admin.canonicalProducts.filters.updatedSince")}
          htmlFor="cp-filter-updated-since"
        >
          <Input
            id="cp-filter-updated-since"
            type="date"
            value={updatedSince ? updatedSince.slice(0, 10) : ""}
            onChange={(e) => setUpdatedSince(e.target.value)}
          />
        </FilterField>
      </div>
    </FilterModal>
  );
}
