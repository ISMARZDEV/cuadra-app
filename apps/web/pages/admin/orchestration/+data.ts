import { listProviderFlows } from "@cuadra/api-client";
import type { PageContextServer } from "vike/types";

import type { OrchestrationData } from "@/features/admin/resources/save-orchestration/interfaces";
import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

// SSR de `/admin/orchestration`. Compone a mano el `+data.ts` del padre — Vike no acumula hooks
// `data()` entre niveles, y el layout necesita `capabilities`/`locale`/`name`.
//
// A diferencia del resto del admin, un fallo acá NO es un `render(500)`: el listado depende de un
// sistema EXTERNO (el runner). Si no responde, la consola tiene que seguir cargando en estado
// degradado — la política vive en nuestra DB y es justo cuando el operador más necesita verla
// (SDD §8). Tumbar la página dejaría al operador sin la herramienta en el peor momento.
export async function data(
  pageContext: PageContextServer,
): Promise<OrchestrationData & AdminShellData> {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);

  const res = await listProviderFlows({
    client: apiClient,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

  if (res.error || !res.data) {
    return { flows: [], runnerDisconnected: true, ...shell };
  }
  // La salud del runner la DECLARA el backend. Antes se infería de que ninguna fila trajera
  // métricas, y eso es falso: un flujo que nunca corrió se ve idéntico a un runner muerto — la
  // consola anunciaba "el orquestador no responde" con el orquestador vivo.
  return {
    flows: res.data.flows,
    runnerDisconnected: !res.data.runner_available,
    ...shell,
  };
}
