import type { CreateProviderFlowRequest, ProviderDto } from "@cuadra/api-client";
import { Plus, Store, Workflow } from "lucide-react";
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

/** v1 solo mapea al handler conocido. El enum es cerrado a propósito: la consola configura POLÍTICA,
 * no crea assets Python. */
const FLOW_KEY = "provider_prices_refresh";

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
  existingProviderIds,
  onClose,
  refresh,
  t,
  locale: _locale,
}: {
  providers: ProviderDto[];
  /** Proveedores que YA tienen flujo: se excluyen del select. La policy es única por
   * (provider, market, flow) y una PAUSADA sigue ocupando el lugar, así que ofrecerlos garantiza
   * un 422 evitable. */
  existingProviderIds: string[];
  onClose: () => void;
  refresh: () => Promise<void>;
  t: T;
  locale: Locale;
}) {
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => providers.filter((p) => !existingProviderIds.includes(p.id)),
    [providers, existingProviderIds],
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
    const res = await createProviderFlow({
      provider_id: providerId,
      flow_key: FLOW_KEY,
    } as CreateProviderFlowRequest);
    setBusy(false);

    const err = (res as { error?: unknown }).error;
    if (err) return setError(reasonOf(err) ?? t("admin.orchestration.create.errSave"));

    await refresh();
    onClose();
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
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

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

      <FilterField icon={<Workflow />} label={t("admin.orchestration.create.fieldFlow")}>
        <p className="rounded-xl border border-border px-3 py-2.5 font-mono text-sm text-muted-foreground">
          {FLOW_KEY}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("admin.orchestration.create.hintFlow")}</p>
      </FilterField>
    </FilterModal>
  );
}
