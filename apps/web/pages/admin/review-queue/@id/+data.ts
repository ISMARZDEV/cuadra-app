import { reviewDetail } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

// SSR del detalle de un match (feature #1, P0): atributos crudos + candidatos, para la vista
// comparativa. Mismo mecanismo de auth que la lista (`extractToken`, batch 2.11) — nunca un
// segundo canal. Filas legacy sin candidatos → `candidates: []` (Fase 1 ya lo garantiza; el
// screen NO trata eso como error).
export async function data(pageContext: PageContextServer) {
  const matchId = pageContext.routeParams.id;
  const token = extractToken(pageContext.headers);

  const res = await reviewDetail({
    client: apiClient,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    path: { match_id: matchId },
  });

  if (res.error || !res.data) {
    throw render(404, "Match no encontrado.");
  }

  return { detail: res.data };
}
