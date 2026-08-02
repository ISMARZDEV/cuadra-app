import type { ProviderDto, ProviderType, SourcePlatform } from "@cuadra/api-client";
import { Store } from "lucide-react";
import { useState } from "react";

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
import { format, type MessageKey } from "@/i18n/messages";

import { createProvider, setProviderLogo, updateProvider } from "../api";
import { platformLabel, PROVIDER_TYPE_OPTIONS, SOURCE_PLATFORM_OPTIONS } from "../types";

export type ProviderModalState = { mode: "add" } | { mode: "edit"; provider: ProviderDto };

const DEFAULT_MARKET = "DO";

// Modal de alta/edición de proveedor. Reusa `FilterModal` como shell — es el mismo que usan
// `SourceModal`, `PolicyModal` y `CreateFlowModal`, así que la consola no termina con dos sistemas
// de diálogo (inventario compartido de cuadra-save-admin).
//
// El logo va por un endpoint APARTE (`PATCH /providers/{id}/logo`), no por el PATCH general. En
// alta se manda dentro del POST; en edición hay que emitir la segunda llamada solo si cambió, para
// no sobrescribir con lo mismo y ensuciar el audit log con una entrada por cada guardado.
export function ProviderModal({
  state,
  onClose,
  refresh,
  t,
  locale,
}: {
  state: ProviderModalState;
  onClose: () => void;
  refresh: () => Promise<void>;
  t: (key: MessageKey) => string;
  locale: Locale;
}) {
  const editing = state.mode === "edit" ? state.provider : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<ProviderType>(editing?.type ?? "supermarket");
  const [platform, setPlatform] = useState<SourcePlatform>(editing?.platform ?? "vtex");
  const [marketId, setMarketId] = useState(editing?.market_id ?? DEFAULT_MARKET);
  const [logoUrl, setLogoUrl] = useState(editing?.logo_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(editing?.name ?? "");
    setType(editing?.type ?? "supermarket");
    setPlatform(editing?.platform ?? "vtex");
    setMarketId(editing?.market_id ?? DEFAULT_MARKET);
    setLogoUrl(editing?.logo_url ?? "");
    setError(null);
  };

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    const nextLogo = logoUrl.trim() || null;

    // Un SOLO `finally` en vez de repetir `setBusy(false)` en cada salida temprana: así también
    // cubre el caso que las repeticiones NO cubrían — que la promesa RECHACE (red caída, 500),
    // donde el botón quedaba deshabilitado para siempre.
    try {
      if (editing) {
        const res = await updateProvider({
          providerId: editing.id,
          name: trimmed,
          type,
          platform,
          marketId: marketId.trim() || DEFAULT_MARKET,
        });
        if (res.error) {
          setError(t("admin.providers.update.nameError"));
          return;
        }
        // Segunda llamada SOLO si el logo cambió: su endpoint es propio y se audita por separado.
        if (nextLogo !== (editing.logo_url ?? null)) {
          const logoRes = await setProviderLogo({ providerId: editing.id, logoUrl: nextLogo });
          if (logoRes.error) {
            setError(t("admin.providers.update.logoError"));
            return;
          }
        }
      } else {
        const res = await createProvider({
          name: trimmed,
          type,
          platform,
          marketId: marketId.trim() || DEFAULT_MARKET,
          logoUrl: nextLogo,
        });
        if (res.error) {
          setError(t("admin.providers.create.error"));
          return;
        }
      }

      await refresh();
      onClose();
    } catch {
      setError(t(editing ? "admin.providers.update.nameError" : "admin.providers.create.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FilterModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        editing
          ? format(locale, "admin.providers.modal.editTitle", { name: editing.name })
          : t("admin.providers.new")
      }
      icon={<Store className="size-5" />}
      onClear={reset}
      onApply={() => void onSubmit()}
      clearLabel={t("admin.providers.modal.cancel")}
      applyLabel={
        busy
          ? t("admin.providers.modal.saving")
          : editing
            ? t("admin.providers.modal.save")
            : t("admin.providers.create.submit")
      }
    >
      <FilterField label={t("admin.providers.field.name")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("admin.providers.field.name")}
        />
      </FilterField>

      <FilterField label={t("admin.providers.field.market")}>
        <Input
          value={marketId}
          onChange={(e) => setMarketId(e.target.value.toUpperCase())}
          aria-label={t("admin.providers.field.market")}
          maxLength={2}
        />
      </FilterField>

      <FilterField label={t("admin.providers.field.type")}>
        <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
          <SelectTrigger aria-label={t("admin.providers.field.type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={t("admin.providers.field.platform")}>
        <Select value={platform} onValueChange={(v) => setPlatform(v as SourcePlatform)}>
          <SelectTrigger aria-label={t("admin.providers.field.platform")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_PLATFORM_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {platformLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={t("admin.providers.field.logo")}>
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          aria-label={t("admin.providers.field.logo")}
          placeholder="https://..."
        />
      </FilterField>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </FilterModal>
  );
}
