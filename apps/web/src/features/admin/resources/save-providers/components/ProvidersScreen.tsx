import type { ProviderRefDto, ProviderType, SourcePlatform } from "@cuadra/api-client";
import type { FormEvent } from "react";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderBadge } from "@/features/save/components/provider-badge";

import { createProvider, setProviderLogo, updateProvider } from "../api";
import type { ProvidersData } from "../interfaces";
import { PROVIDER_TYPE_OPTIONS, SOURCE_PLATFORM_OPTIONS } from "../types";

const DEFAULT_MARKET = "DO";

// Consola de Providers (3.5): alta + edición de supermercados. No hay endpoint admin de LISTADO
// todavía (ver `api.ts`) — la lista viene del público `listProviders` (SSR, `+data.ts`), así que
// solo prellenamos/editamos lo que ese DTO trae (name, logo_url); tipo/plataforma/mercado se fijan
// solo al CREAR. Tras cualquier mutación exitosa, `window.location.reload()` (mismo patrón que
// `ReviewQueueListScreen`) re-pide la lista SSR — sin TanStack Query en web.
export function ProvidersScreen() {
  const { providers } = useData<ProvidersData>();

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">Proveedores (Save)</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Alta y logo por URL pegada (MVP, sin subida de archivos).
      </p>

      <CreateProviderForm />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Existentes</h2>
      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin proveedores todavía.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {providers.map((p) => (
            <ProviderRow key={p.id} provider={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateProviderForm() {
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
      setError("No se pudo crear el proveedor.");
      return;
    }
    window.location.reload();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:max-w-md"
    >
      <h2 className="text-sm font-semibold">Nuevo proveedor</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className="flex flex-col gap-1 text-sm">
        Nombre
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Mercado
        <Input value={marketId} onChange={(e) => setMarketId(e.target.value)} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Tipo
        <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Plataforma
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
        Logo (URL, opcional)
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>

      <Button type="submit" disabled={busy}>
        Crear proveedor
      </Button>
    </form>
  );
}

function ProviderRow({ provider }: { provider: ProviderRefDto }) {
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
    if (res.error) setError("No se pudo actualizar el nombre.");
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
      setError("No se pudo guardar el logo.");
      return;
    }
    window.location.reload();
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <ProviderBadge name={provider.name} logoUrl={provider.logo_url} />

      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {`Nombre de ${provider.name}`}
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40" />
      </label>
      <Button size="sm" variant="outline" disabled={busyName} onClick={() => void onSaveName()}>
        {`Guardar nombre de ${provider.name}`}
      </Button>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {`Logo de ${provider.name}`}
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className="h-8 w-56"
          placeholder="https://…"
        />
      </label>
      <Button size="sm" disabled={busyLogo} onClick={() => void onSaveLogo()}>
        {`Guardar logo de ${provider.name}`}
      </Button>
    </li>
  );
}
