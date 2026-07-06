import type { SourceHealthDto, SourcePlatform } from "@cuadra/api-client";
import type { FormEvent } from "react";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/features/save/lib/format";

import type { ProbeResult } from "../api";
import { createSourceConfig, pauseSourceConfig, probeSource, resumeSourceConfig } from "../api";
import type { SourcesData } from "../interfaces";
import { SOURCE_PLATFORM_OPTIONS } from "../types";
import { HealthBadge } from "./HealthBadge";

// Consola de Fuentes (3.11-3.12, 3.19-web): alta + pausa/reanudación + "Probar" (dry-run). El
// campo Base URL alcanza para el MVP; headers/endpoints/auth avanzados (p.ej. store_code vía
// headers, caso real de VTEX multi-tienda) quedan para una edición posterior — no bloquear la alta
// en un form gigante. Tras mutar, `window.location.reload()` (mismo patrón que ProvidersScreen).
export function SourcesScreen() {
  const { sources } = useData<SourcesData>();

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">Fuentes (Save)</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Configuración de scraping por proveedor. "Probar" es una vista previa — no guarda nada.
      </p>

      <CreateSourceForm />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Existentes</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin fuentes todavía.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateSourceForm() {
  const [providerId, setProviderId] = useState("");
  const [platform, setPlatform] = useState<SourcePlatform>("vtex");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createSourceConfig({ providerId, platform, baseUrl });
    setBusy(false);
    if (res.error) {
      setError("No se pudo crear la fuente.");
      return;
    }
    window.location.reload();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:max-w-md"
    >
      <h2 className="text-sm font-semibold">Nueva fuente</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className="flex flex-col gap-1 text-sm">
        Proveedor (id)
        <Input value={providerId} onChange={(e) => setProviderId(e.target.value)} required />
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
        Base URL
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://…"
          required
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Headers/endpoints/auth avanzados (p.ej. store_code vía headers) se editan luego — esta alta
        crea con lo mínimo.
      </p>

      <Button type="submit" disabled={busy}>
        Crear fuente
      </Button>
    </form>
  );
}

function SourceRow({ source }: { source: SourceHealthDto }) {
  const [busyToggle, setBusyToggle] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const isPaused = source.health === "paused";

  const onTogglePause = async () => {
    setBusyToggle(true);
    setToggleError(null);
    const res = isPaused
      ? await resumeSourceConfig(source.id)
      : await pauseSourceConfig(source.id);
    setBusyToggle(false);
    if (res.error) {
      setToggleError(
        isPaused ? "No se pudo reanudar la fuente." : "No se pudo pausar la fuente.",
      );
      return;
    }
    window.location.reload();
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <HealthBadge health={source.health} />
        <span className="font-medium">{source.platform}</span>
        <span className="text-sm text-muted-foreground">{source.base_url}</span>

        {toggleError ? <p className="w-full text-sm text-destructive">{toggleError}</p> : null}

        <Button size="sm" variant="outline" disabled={busyToggle} onClick={() => void onTogglePause()}>
          {isPaused ? `Reanudar ${source.platform}` : `Pausar ${source.platform}`}
        </Button>

        <Button size="sm" variant="secondary" onClick={() => setProbing((p) => !p)}>
          {probing ? "Cerrar prueba" : "Probar"}
        </Button>
      </div>

      {probing ? <ProbePanel sourceId={source.id} /> : null}
    </li>
  );
}

function ProbePanel({ sourceId }: { sourceId: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await probeSource(sourceId, query);
    setBusy(false);
    setResult(res);
  };

  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Vista previa — esta prueba NO guarda nada.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Query de búsqueda…"
          aria-label={`Query de prueba para ${sourceId}`}
        />
        <Button type="submit" size="sm" disabled={busy}>
          Ejecutar
        </Button>
      </form>

      {result ? <ProbeResultView result={result} /> : null}
    </div>
  );
}

function ProbeResultView({ result }: { result: ProbeResult }) {
  if (!result.ok) {
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        {result.kind === "config"
          ? `Configuración inválida: ${result.message}`
          : `La tienda no respondió: ${result.message}`}
      </p>
    );
  }

  if (result.samples.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Sin resultados para esa query.</p>;
  }

  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th>ID externo</th>
          <th>Nombre</th>
          <th>Marca</th>
          <th>Precio</th>
          <th>EAN</th>
        </tr>
      </thead>
      <tbody>
        {result.samples.map((s) => (
          <tr key={s.external_id}>
            <td>{s.external_id}</td>
            <td>{s.name}</td>
            <td>{s.brand}</td>
            <td>{formatMoney(s.price_minor, s.currency)}</td>
            <td>{s.ean ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
