import type { ProviderDto, ProviderType, SourcePlatform } from "@cuadra/api-client";
import type { FormEvent } from "react";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderBadge } from "@/features/save/components/provider-badge";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { createProvider, listProvidersEntries, setProviderLogo, updateProvider } from "../api";
import type { ProvidersData } from "../interfaces";
import { PROVIDER_TYPE_OPTIONS, SOURCE_PLATFORM_OPTIONS } from "../types";

type T = (key: MessageKey) => string;

const DEFAULT_MARKET = "DO";

// Consola de Providers (3.5 / #11): alta + edición de supermercados. La lista viene del endpoint
// ADMIN `listAdminProviders` (SSR `+data.ts`, DTO completo type/platform/market). El rediseño de la
// UI para editar tipo/plataforma es P1 (§7.2); por ahora se editan name + logo. Tras cualquier
// mutación exitosa, `useAdminList` refresca la lista client-side (reemplaza
// `window.location.reload()`) — sin TanStack Query en web. i18n (10.A): strings vía `useAdminI18n`,
// locale threadeado por SSR (`AdminShellData.locale`); interpolados por-fila vía `format`.
export function ProvidersScreen() {
  const { providers: initialProviders, locale = DEFAULT_LOCALE } = useData<
    ProvidersData & { locale?: Locale }
  >();
  const { t } = useAdminI18n(locale);
  const { items: providers, refresh } = useAdminList(initialProviders, () =>
    listProvidersEntries(DEFAULT_MARKET),
  );

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">{t("admin.providers.title")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("admin.providers.subtitle")}</p>

      <CreateProviderForm refresh={refresh} t={t} />

      <h2 className="mb-3 mt-8 text-lg font-semibold">{t("admin.providers.existing")}</h2>
      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.providers.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {providers.map((p) => (
            <ProviderRow key={p.id} provider={p} refresh={refresh} t={t} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateProviderForm({ refresh, t }: { refresh: () => Promise<void>; t: T }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ProviderType>("supermarket");
  const [platform, setPlatform] = useState<SourcePlatform>("vtex");
  const [marketId, setMarketId] = useState(DEFAULT_MARKET);
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createProvider({
      name,
      type,
      platform,
      marketId,
      logoUrl: logoUrl.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      setError(t("admin.providers.create.error"));
      return;
    }
    await refresh();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:max-w-md"
    >
      <h2 className="text-sm font-semibold">{t("admin.providers.new")}</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.providers.field.name")}
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.providers.field.market")}
        <Input value={marketId} onChange={(e) => setMarketId(e.target.value)} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.providers.field.type")}
        <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPE_OPTIONS.map((t2) => (
              <SelectItem key={t2} value={t2}>
                {t2}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.providers.field.platform")}
        <Select value={platform} onValueChange={(v) => setPlatform(v as SourcePlatform)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_PLATFORM_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.providers.field.logo")}
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>

      <Button type="submit" disabled={busy}>
        {t("admin.providers.create.submit")}
      </Button>
    </form>
  );
}

function ProviderRow({
  provider,
  refresh,
  t,
  locale,
}: {
  provider: ProviderDto;
  refresh: () => Promise<void>;
  t: T;
  locale: Locale;
}) {
  const [name, setName] = useState(provider.name);
  const [logoUrl, setLogoUrl] = useState(provider.logo_url ?? "");
  const [busyName, setBusyName] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSaveName = async () => {
    setBusyName(true);
    setError(null);
    const res = await updateProvider({ providerId: provider.id, name });
    setBusyName(false);
    if (res.error) setError(t("admin.providers.update.nameError"));
  };

  const onSaveLogo = async () => {
    setBusyLogo(true);
    setError(null);
    const res = await setProviderLogo({
      providerId: provider.id,
      logoUrl: logoUrl.trim() || null,
    });
    setBusyLogo(false);
    if (res.error) {
      setError(t("admin.providers.update.logoError"));
      return;
    }
    await refresh();
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <ProviderBadge name={provider.name} logoUrl={provider.logo_url} />

      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {format(locale, "admin.providers.row.name", { name: provider.name })}
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40" />
      </label>
      <Button size="sm" variant="outline" disabled={busyName} onClick={() => void onSaveName()}>
        {format(locale, "admin.providers.row.saveName", { name: provider.name })}
      </Button>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {format(locale, "admin.providers.row.logo", { name: provider.name })}
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className="h-8 w-56"
          placeholder="https://…"
        />
      </label>
      <Button size="sm" disabled={busyLogo} onClick={() => void onSaveLogo()}>
        {format(locale, "admin.providers.row.saveLogo", { name: provider.name })}
      </Button>
    </li>
  );
}
