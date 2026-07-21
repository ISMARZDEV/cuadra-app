import { getProviderDetail, getRunEvents, listProviderRuns } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../../../+data";

// SSR del detalle por proveedor (#11). Sin `+guard.ts` propio a propósito: hereda el de
// `orchestration/+guard.ts`, que es el más específico hacia arriba y el ÚNICO control real sobre el
// runner (Dagster OSS no tiene auth). Añadir uno acá sería duplicar ese chequeo.
//
// Un 404 del backend ("no hay policy activa para ese proveedor") SÍ tumba la página — no hay nada
// que operar. Pero el runner CAÍDO no: el endpoint responde 200 con `runner_available:false` y la
// página rinde en estado degradado, porque la policy vive en NUESTRA DB y es justo cuando el
// operador más necesita verla (SDD §8).
export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const providerId = pageContext.routeParams.id;
  const token = extractToken(pageContext.headers);
  const auth = token ? { authorization: `Bearer ${token}` } : undefined;

  // El histórico se trae por SSR junto al detalle, NO en un `useEffect` del cliente. La razón es un
  // bug real: en un refresh el token de auth (localStorage/Clerk) todavía no está listo cuando el
  // efecto dispara, así que el fetch iba sin token y la tabla salía vacía; en navegación cliente el
  // token ya estaba en memoria y sí cargaba. El server SÍ tiene el token (cookie), así que SSR
  // elimina la carrera — igual que la lista y la cola de revisión.
  const [res, runsRes] = await Promise.all([
    getProviderDetail({ client: apiClient, headers: auth, path: { provider_id: providerId } }),
    listProviderRuns({
      client: apiClient,
      headers: auth,
      path: { provider_id: providerId },
      query: { limit: 50 },
    }),
  ]);

  if (res.error || !res.data) {
    throw render(404, "Proveedor no encontrado o sin flujo configurado.");
  }

  // `runsAvailable=false` (runner caído) NO es lo mismo que histórico vacío: el primero se declara,
  // el segundo se muestra como "sin corridas". La página rinde igual — la config vive en nuestra DB.
  const runsAvailable = !runsRes.error && !!runsRes.data;

  // US-OR-D7 — la actividad de la corrida actual se siembra por SSR, por la MISMA razón que el
  // histórico: en un refresh el token de auth todavía no está listo en el cliente, así que un
  // `useEffect` saldría sin token y el panel diría "sin actividad" cuando lo cierto es "no pude
  // preguntar". Va después del detalle y no en paralelo porque el id de la corrida sale de él.
  // `?run_id=` elige QUÉ corrida mira el panel; sin él, la actual. Vive en la URL y no solo en el
  // estado de React por tres razones: un refresh no pierde lo que el operador estaba investigando,
  // el enlace se puede pegar en un chat ("mirá por qué falló esta"), y es la MISMA convención de
  // deep-link que este módulo ya usa para mandar de una corrida a la cola de revisión.
  const selectedRunId =
    (pageContext.urlParsed.search?.run_id as string | undefined) || res.data.current_run?.run_id;
  const eventsRes = selectedRunId
    ? await getRunEvents({
        client: apiClient,
        headers: auth,
        path: { provider_id: providerId, run_id: selectedRunId },
        query: { limit: 200 },
      })
    : null;

  return {
    detail: res.data,
    initialRuns: runsRes.data?.runs ?? [],
    initialCursor: runsRes.data?.next_cursor ?? null,
    runsAvailable,
    // `null` = no pudimos preguntar (runner caído o corrida inexistente); `[]` = la corrida no
    // registró eventos. El panel dice cosas DISTINTAS para cada caso — confundirlos es la mentira
    // que este módulo ya cometió una vez con "nunca corrió" vs "runner muerto".
    initialEvents: eventsRes?.data?.events ?? null,
    initialEventsCursor: eventsRes?.data?.next_cursor ?? null,
    selectedRunId: selectedRunId ?? null,
    ...shell,
  };
}

export type { AdminShellData };
