import {
  createSource as createSourceRequest,
  listSourcesHealth as listSourcesHealthRequest,
  pauseSource as pauseSourceRequest,
  resumeSource as resumeSourceRequest,
  testSource as testSourceRequest,
  updateSource as updateSourceRequest,
} from "@cuadra/api-client";
import type { SampleEntryDto, SourceHealthDto, SourcePlatform } from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Mutaciones client-side de la consola de Fuentes (3.11-3.12): MISMO mecanismo de auth que
// `save-providers/api.ts` (`authHeaders()`, token async de Clerk). A diferencia de Providers, acá
// SÍ hay endpoint admin de listado (`listSourcesHealth`, 3.18-3.19) — se usa tanto en SSR
// (`+data.ts`, con el token de sesión) como para refrescar tras mutar (`window.location.reload()`).
export async function createSourceConfig(params: {
  providerId: string;
  platform: SourcePlatform;
  baseUrl: string;
  endpoints?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
  auth?: Record<string, unknown> | null;
}) {
  return createSourceRequest({
    client: apiClient,
    headers: await authHeaders(),
    body: {
      provider_id: params.providerId,
      platform: params.platform,
      base_url: params.baseUrl,
      endpoints: params.endpoints ?? null,
      headers: params.headers ?? null,
      auth: params.auth ?? null,
    },
  });
}

export async function updateSourceConfig(params: {
  sourceId: string;
  platform?: SourcePlatform | null;
  baseUrl?: string | null;
  endpoints?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
  auth?: Record<string, unknown> | null;
}) {
  return updateSourceRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { source_id: params.sourceId },
    body: {
      platform: params.platform ?? null,
      base_url: params.baseUrl ?? null,
      endpoints: params.endpoints ?? null,
      headers: params.headers ?? null,
      auth: params.auth ?? null,
    },
  });
}

export async function pauseSourceConfig(sourceId: string) {
  return pauseSourceRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { source_id: sourceId },
  });
}

export async function resumeSourceConfig(sourceId: string) {
  return resumeSourceRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { source_id: sourceId },
  });
}

export async function listSourcesHealthEntries(market?: string): Promise<SourceHealthDto[]> {
  const res = await listSourcesHealthRequest({
    client: apiClient,
    headers: await authHeaders(),
    query: market ? { market } : undefined,
  });
  return res.data ?? [];
}

// Resultado discriminado de la prueba (3.11-3.12, SAGRADO: nunca colapsar a `null`) — la UI debe
// distinguir "config inválida/SSRF" (422, `TestSourceConfigError`) de "el origen no respondió"
// (502, `TestSourceUpstreamError`); son causas y remedios distintos para quien opera la fuente.
export type ProbeResult =
  | { ok: true; samples: SampleEntryDto[] }
  | { ok: false; kind: "config" | "upstream"; message: string };

export async function probeSource(sourceId: string, query: string): Promise<ProbeResult> {
  const res = await testSourceRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { source_id: sourceId },
    body: { query },
  });

  if (!res.error) {
    return { ok: true, samples: res.data ?? [] };
  }

  // El status crudo de la Response (no el body de error) es lo que discrimina 422 vs 502 — ver
  // `@hey-api/client-fetch`: la respuesta siempre trae `{ data, error, response }`.
  const status = res.response?.status;
  if (status === 422) {
    return {
      ok: false,
      kind: "config",
      message: "la configuración de esta fuente es inválida o fue bloqueada por el guard SSRF.",
    };
  }
  return {
    ok: false,
    kind: "upstream",
    message: "la tienda de origen no respondió. Intenta de nuevo más tarde.",
  };
}
