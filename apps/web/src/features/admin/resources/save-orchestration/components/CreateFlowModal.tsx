import type { CreateProviderFlowRequest, ProviderDto } from "@cuadra/api-client";
import { ChevronDown, Plus, Store, Workflow } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import {
  FilterSearchSelect,
  type FilterSearchSelectOption,
} from "@/features/admin/components/filters/FilterSearchSelect";
import { providerLogoByName } from "@/features/save/lib/provider-logos";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { createProviderFlow } from "../api";

type T = (key: MessageKey) => string;

/** Cerrado a propósito: la consola configura POLÍTICA, no crea assets Python. Debe coincidir con
 * `FlowKey`/`JOB_BY_FLOW` del backend — sumar uno acá sin allá crea un flow que no corre. */
const FLOWS = ["provider_prices_refresh", "provider_price_refresh", "provider_browse"] as const;
type FlowKeyValue = (typeof FLOWS)[number];

/** Saca el motivo real que mandó el backend. El 422 de `ProviderFlowNotSupported` trae el porqué
 * (sin fuente / apagada / la plataforma no sabe hacerlo) — tragarlo y mostrar "algo salió mal"
 * tiraría a la basura justo la parte útil. */
function reasonOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const detail = (error as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

// Alta de un provider-flow. El `POST` existía desde F4 sin consumidor en la UI: dar de alta una
// tienda exigía un `curl`, y por eso los 3 flujos actuales se sembraron a mano.
export function CreateFlowModal({
  providers,
  existingFlows,
  onClose,
  refresh,
  t,
  locale: _locale,
}: {
  providers: ProviderDto[];
  /** Flujos ya existentes. La unicidad es por (provider, market, FLOW): un proveedor con
   * descubrimiento puede tener además refresco. Se excluye el par, no el proveedor. Una policy
   * PAUSADA sigue ocupando el lugar. */
  existingFlows: { provider_id: string; flow_key: string }[];
  onClose: () => void;
  refresh: () => Promise<void>;
  t: T;
  locale: Locale;
}) {
  const [providerId, setProviderId] = useState("");
  const [flowKey, setFlowKey] = useState<FlowKeyValue>("provider_prices_refresh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () =>
      providers.filter(
        (p) => !existingFlows.some((f) => f.provider_id === p.id && f.flow_key === flowKey),
      ),
    [providers, existingFlows, flowKey],
  );

  const options: FilterSearchSelectOption[] = useMemo(
    () =>
      available.map((p) => {
        const logo = p.logo_url ?? providerLogoByName(p.name);
        return {
          value: p.id,
          label: p.name,
          icon: logo ? <img src={logo} alt="" className="size-5 rounded object-contain" /> : null,
        };
      }),
    [available],
  );

  const apply = async () => {
    if (!providerId) return setError(t("admin.orchestration.create.errProviderRequired"));

    setBusy(true);
    setError(null);
    // `finally`: si la promesa RECHAZA (red caída, 500), un `setBusy(false)` en el camino feliz no
    // corre y el botón queda deshabilitado para siempre — hay que cerrar y reabrir el modal.
    try {
      const res = await createProviderFlow({
        provider_id: providerId,
        flow_key: flowKey,
      } as CreateProviderFlowRequest);

      const err = (res as { error?: unknown }).error;
      if (err) return setError(reasonOf(err) ?? t("admin.orchestration.create.errSave"));

      await refresh();
      onClose();
    } catch {
      setError(t("admin.orchestration.create.errSave"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FilterModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t("admin.orchestration.create.title")}
      icon={<Plus />}
      onClear={() => {
        setProviderId("");
        setError(null);
      }}
      onApply={() => void apply()}
      clearLabel={t("admin.orchestration.create.clear")}
      applyLabel={busy ? t("admin.orchestration.create.saving") : t("admin.orchestration.create.save")}
      applyIcon={<Plus className="size-4" />}
      // El listbox del combobox es `absolute` y el body del modal es `overflow-y-auto`, que lo
      // RECORTA. Sin un alto reservado el modal se ajusta a dos campos (~300px) y la lista no tiene
      // dónde desplegarse.
      className="min-h-[min(34rem,90vh)]"
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* El FLUJO va primero: la lista de proveedores se calcula a partir de él. */}
      <FilterField
        icon={<Workflow />}
        label={t("admin.orchestration.create.fieldFlow")}
        htmlFor="create-flow"
      >
        {/* `appearance-none` + chevron propio: la flecha nativa del sistema no coincide con la del
            combobox de proveedor (más oscura y con otra métrica). */}
        <div className="relative">
          <select
            id="create-flow"
            data-testid="create-flow"
            value={flowKey}
            onChange={(e) => {
              setFlowKey(e.target.value as FlowKeyValue);
              // El proveedor elegido puede no estar disponible para el flujo nuevo: arrastrarlo
              // mandaría un par (proveedor, flujo) ya existente y el backend responde 422.
              setProviderId("");
              setError(null);
            }}
            className="h-11 w-full appearance-none rounded-xl border border-input bg-card pr-9 pl-3 text-sm shadow-xs transition-[color,box-shadow] focus:border-ring focus:ring-[3px] focus:ring-ring/50 focus:outline-none"
          >
            {FLOWS.map((f) => (
              <option key={f} value={f}>
                {t(`admin.orchestration.flow.${f}` as MessageKey)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground opacity-50"
          />
        </div>
        {/* Qué HACE el flujo: `provider_prices_refresh` y `provider_price_refresh` se diferencian
            en una `s` y hacen cosas opuestas. */}
        <p data-testid="create-flow-help" className="mt-1.5 text-xs text-muted-foreground">
          {t(`admin.orchestration.create.flowHelp.${flowKey}` as MessageKey)}
        </p>
      </FilterField>

      {available.length === 0 ? (
        // Vacío HONESTO: dice POR QUÉ no hay nada que elegir, en vez de un select mudo.
        <p
          data-testid="create-no-providers"
          className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          {t("admin.orchestration.create.noProviders")}
        </p>
      ) : (
        <FilterField
          icon={<Store />}
          label={t("admin.orchestration.create.fieldProvider")}
          htmlFor="create-provider"
        >
          <FilterSearchSelect
            id="create-provider"
            value={providerId || undefined}
            onChange={(v) => setProviderId(v ?? "")}
            options={options}
            placeholder={t("admin.orchestration.create.providerSearch")}
            allLabel={t("admin.orchestration.create.providerAll")}
          />
        </FilterField>
      )}

      <p className="text-xs text-muted-foreground">{t("admin.orchestration.create.hintFlow")}</p>
    </FilterModal>
  );
}
