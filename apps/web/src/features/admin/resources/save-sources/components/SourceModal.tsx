import type { ProviderRefDto, SourceHealthDto, SourcePlatform } from "@cuadra/api-client";
import { KeyRound, Link2, Pencil, Plus, Search, Server, Store } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import {
  FilterSearchSelect,
  type FilterSearchSelectOption,
} from "@/features/admin/components/filters/FilterSearchSelect";
import { formatMoney } from "@/features/save/lib/format";
import { providerLogoByName } from "@/features/save/lib/provider-logos";

import { createSourceConfig, probeSource, updateSourceConfig, type ProbeResult } from "../api";
import { SOURCE_AUTH_TYPES, SOURCE_PLATFORM_OPTIONS, platformLabel, type SourceAuthType } from "../types";

export type SourceModalState = { mode: "add" } | { mode: "edit"; source: SourceHealthDto };

const MASK = "••••"; // marca del secreto enmascarado (§15.5) — si sigue presente, no se reescribe

// Parsea un textarea JSON opcional: vacío → undefined; inválido → error legible que bloquea el submit.
function parseJson(raw: string, label: string): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(t) as Record<string, unknown> };
  } catch {
    return { ok: false, error: `JSON inválido en ${label}` };
  }
}

// Modal de alta/edición de una fuente — mismo `FilterModal` que la Canasta curada / Cola de Revisión.
// El AUTH es TIPADO (§15.2): el select decide los campos; el secreto llega enmascarado en edición y
// solo se reescribe si el admin lo cambia (write-only, §15.5).
export function SourceModal({
  state,
  providers,
  onClose,
  refresh,
}: {
  state: SourceModalState;
  providers: ProviderRefDto[];
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const isEdit = state.mode === "edit";
  const src = isEdit ? state.source : null;
  const auth = (src?.auth ?? null) as Record<string, string> | null;

  const [providerId, setProviderId] = useState(src?.provider_id ?? "");
  const [platform, setPlatform] = useState<SourcePlatform>(src?.platform ?? "vtex");
  const [baseUrl, setBaseUrl] = useState(src?.base_url ?? "");
  const [authType, setAuthType] = useState<SourceAuthType>((auth?.type as SourceAuthType) ?? "none");
  const [token, setToken] = useState(auth?.token ?? "");
  const [keyIn, setKeyIn] = useState<"header" | "query">((auth?.in as "header" | "query") ?? "header");
  const [keyName, setKeyName] = useState(auth?.name ?? "");
  const [keyValue, setKeyValue] = useState(auth?.value ?? "");
  const [user, setUser] = useState(auth?.username ?? "");
  const [pass, setPass] = useState(auth?.password ?? "");
  const [headersRaw, setHeadersRaw] = useState(src?.headers ? JSON.stringify(src.headers, null, 2) : "");
  const [endpointsRaw, setEndpointsRaw] = useState(src?.endpoints ? JSON.stringify(src.endpoints, null, 2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerOptions: FilterSearchSelectOption[] = useMemo(
    () =>
      providers.map((p) => {
        const logo = p.logo_url ?? providerLogoByName(p.name);
        return {
          value: p.id,
          label: p.name,
          icon: logo ? (
            <img src={logo} alt="" className="size-5 rounded object-contain" />
          ) : null,
        };
      }),
    [providers],
  );

  const buildAuth = (): Record<string, unknown> | null => {
    // Secreto sin tocar (sigue enmascarado) → null: en edición el backend conserva el existente.
    const secretMasked =
      (authType === "bearer" && token.includes(MASK)) ||
      (authType === "api_key" && keyValue.includes(MASK)) ||
      (authType === "basic" && pass.includes(MASK));
    if (authType === "none" || secretMasked) return null;
    if (authType === "bearer") return { type: "bearer", token };
    if (authType === "api_key") return { type: "api_key", in: keyIn, name: keyName, value: keyValue };
    return { type: "basic", username: user, password: pass };
  };

  const apply = async () => {
    if (!isEdit && !providerId.trim()) return setError("El id del proveedor es obligatorio.");
    if (!baseUrl.trim()) return setError("La Base URL es obligatoria.");
    const headers = parseJson(headersRaw, "Headers");
    if (!headers.ok) return setError(headers.error);
    const endpoints = parseJson(endpointsRaw, "Endpoints");
    if (!endpoints.ok) return setError(endpoints.error);

    setBusy(true);
    setError(null);
    const authValue = buildAuth();
    if (isEdit) {
      const res = await updateSourceConfig({
        sourceId: src!.id,
        platform,
        baseUrl,
        headers: headers.value ?? null,
        endpoints: endpoints.value ?? null,
        auth: authValue,
      });
      setBusy(false);
      if (res.error) return setError("No se pudo guardar la fuente.");
    } else {
      const res = await createSourceConfig({
        providerId,
        platform,
        baseUrl,
        headers: headers.value ?? null,
        endpoints: endpoints.value ?? null,
        auth: authValue,
      });
      setBusy(false);
      if (res.error) return setError("No se pudo crear la fuente.");
    }
    await refresh();
    onClose();
  };

  return (
    <FilterModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={isEdit ? "Editar fuente" : "Agregar proveedor"}
      icon={isEdit ? <Pencil /> : <Plus />}
      onClear={() => {
        setError(null);
        if (!isEdit) {
          setProviderId("");
          setBaseUrl("");
          setAuthType("none");
        }
      }}
      onApply={() => void apply()}
      clearLabel="Limpiar"
      applyLabel={busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear fuente"}
      applyIcon={isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!isEdit ? (
        <FilterField icon={<Store />} label="Proveedor" htmlFor="source-provider">
          <FilterSearchSelect
            id="source-provider"
            value={providerId || undefined}
            onChange={(v) => setProviderId(v ?? "")}
            options={providerOptions}
            placeholder="Buscar proveedor…"
            allLabel="Selecciona un proveedor…"
          />
        </FilterField>
      ) : null}

      <FilterField icon={<Server />} label="Plataforma" htmlFor="source-platform">
        <Select value={platform} onValueChange={(v) => setPlatform(v as SourcePlatform)}>
          <SelectTrigger id="source-platform" className="h-11! rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_PLATFORM_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {platformLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField icon={<Link2 />} label="Base URL" htmlFor="source-url">
        <Input id="source-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" className="h-11! rounded-xl" />
      </FilterField>

      {/* Auth TIPADO (§15.2): el select decide los campos; el secreto es write-only (enmascarado). */}
      <FilterField icon={<KeyRound />} label="Autenticación" htmlFor="source-auth-type">
        <Select value={authType} onValueChange={(v) => setAuthType(v as SourceAuthType)}>
          <SelectTrigger id="source-auth-type" className="h-11! rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_AUTH_TYPES.map((a) => (
              <SelectItem key={a} value={a}>
                {AUTH_LABEL[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      {authType === "bearer" ? (
        <FilterField label="Token (Bearer)" htmlFor="source-token">
          <Input id="source-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Authorization: Bearer …" className="h-11! rounded-xl" />
        </FilterField>
      ) : null}

      {authType === "api_key" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
          <FilterField label="Ubicación" htmlFor="source-key-in">
            <Select value={keyIn} onValueChange={(v) => setKeyIn(v as "header" | "query")}>
              <SelectTrigger id="source-key-in" className="h-11! rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Nombre" htmlFor="source-key-name">
            <Input id="source-key-name" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="X-Auth-Token" className="h-11! rounded-xl" />
          </FilterField>
          <div className="sm:col-span-2">
            <FilterField label="Valor" htmlFor="source-key-value">
              <Input id="source-key-value" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} placeholder="el token/clave" className="h-11! rounded-xl" />
            </FilterField>
          </div>
        </div>
      ) : null}

      {authType === "basic" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FilterField label="Usuario" htmlFor="source-user">
            <Input id="source-user" value={user} onChange={(e) => setUser(e.target.value)} className="h-11! rounded-xl" />
          </FilterField>
          <FilterField label="Contraseña" htmlFor="source-pass">
            <Input id="source-pass" value={pass} onChange={(e) => setPass(e.target.value)} className="h-11! rounded-xl" />
          </FilterField>
        </div>
      ) : null}

      <details className="rounded-xl border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold text-foreground">Avanzado (Headers / Endpoints)</summary>
        <div className="mt-3 space-y-3">
          <FilterField label="Headers (JSON)" htmlFor="source-headers">
            <Textarea id="source-headers" value={headersRaw} onChange={(e) => setHeadersRaw(e.target.value)} placeholder={'{"Store": "jumbo", "User-Agent": "…"}'} className="rounded-xl font-mono text-xs" />
          </FilterField>
          <FilterField label="Endpoints (JSON)" htmlFor="source-endpoints">
            <Textarea id="source-endpoints" value={endpointsRaw} onChange={(e) => setEndpointsRaw(e.target.value)} placeholder={'{"profile": "bravova", "sections": ["3"], "store_id": "1000"}'} className="rounded-xl font-mono text-xs" />
          </FilterField>
        </div>
      </details>

      {isEdit ? <ProbePanel sourceId={src!.id} /> : null}
    </FilterModal>
  );
}

const AUTH_LABEL: Record<SourceAuthType, string> = {
  none: "Ninguna",
  bearer: "Bearer token",
  api_key: "API key",
  basic: "Usuario y contraseña",
};

// Probar (dry-run, §admin) — solo en edición (la fuente ya existe). NO guarda nada.
function ProbePanel({ sourceId }: { sourceId: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setResult(await probeSource(sourceId, query));
    setBusy(false);
  };

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Probar (vista previa) — no guarda nada.</p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Query de búsqueda…" aria-label="Query de prueba" className="h-10 rounded-xl" />
        <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-forest px-4 text-sm font-semibold text-brand-lime disabled:opacity-50">
          <Search className="size-4" />
          {busy ? "Probando…" : "Probar"}
        </button>
      </form>
      {result ? <ProbeResultView result={result} /> : null}
    </div>
  );
}

function ProbeResultView({ result }: { result: ProbeResult }) {
  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {result.kind === "config" ? `Configuración inválida: ${result.message}` : `La tienda no respondió: ${result.message}`}
      </p>
    );
  }
  if (result.samples.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin resultados para esa query.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {result.samples.slice(0, 5).map((s) => (
        <li key={s.external_id} className="flex items-center gap-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatMoney(s.price_minor, s.currency)}</span>
        </li>
      ))}
    </ul>
  );
}
