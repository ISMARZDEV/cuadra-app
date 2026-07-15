import { listReviewQueue, reviewDetail } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../../+data";

// SSR del detalle de un match (feature #1, P0): atributos crudos + candidatos, para la vista
// comparativa. Mismo mecanismo de auth que la lista (`extractToken`, batch 2.11) — nunca un
// segundo canal. Filas legacy sin candidatos → `candidates: []` (Fase 1 ya lo garantiza; el
// screen NO trata eso como error).
//
// Compone la data del `+data.ts` de `pages/admin/` (batch 2e) — mismo motivo que la lista: Vike no
// acumula hooks `data()`, `+Layout.tsx` necesita `capabilities` para el nav.
export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const matchId = pageContext.routeParams.id;
  const token = extractToken(pageContext.headers);
  const authHeader = token ? { authorization: `Bearer ${token}` } : undefined;

  const res = await reviewDetail({
    client: apiClient,
    headers: authHeader,
    path: { match_id: matchId },
  });

  if (res.error || !res.data) {
    throw render(404, "Match no encontrado.");
  }

  const queue = await resolveQueueContext(matchId, authHeader);

  return { detail: res.data, ...queue, ...shell };
}

// Contexto del match dentro de la cola (atajos `p`/`n` + pager "posición/total"), con el orden
// default (uncertainty-first). Best-effort — si la query falla, el actual es el primero/último, o no
// está en la primera página, devuelve `null` para ese lado / posición. Mercado DO (único activo hoy).
async function resolveQueueContext(
  currentMatchId: string,
  authHeader: { authorization: string } | undefined,
): Promise<{
  prevMatchId: string | null;
  nextMatchId: string | null;
  queuePosition: number | null;
  queueTotal: number;
}> {
  const queue = await listReviewQueue({
    client: apiClient,
    headers: authHeader,
    query: { market: "DO", order_by: "uncertainty", limit: 200, offset: 0 },
  });
  const rows = queue.data?.rows ?? [];
  const queueTotal = queue.data?.total ?? rows.length;
  const idx = rows.findIndex((r) => r.match_id === currentMatchId);
  if (idx === -1) {
    return { prevMatchId: null, nextMatchId: null, queuePosition: null, queueTotal };
  }
  return {
    prevMatchId: rows[idx - 1]?.match_id ?? null,
    nextMatchId: rows[idx + 1]?.match_id ?? null,
    queuePosition: idx + 1,
    queueTotal,
  };
}

export type { AdminShellData };
