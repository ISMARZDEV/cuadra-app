import type { PageContextServer } from "vike/types";

import { data as adminShellData, type AdminShellData } from "../+data";

// SSR de `/admin/orchestration`. Hoy SOLO compone a mano el `+data.ts` del padre — Vike no acumula
// hooks `data()` entre niveles, y `+Layout.clear.tsx` necesita `capabilities`/`locale`/`name` para
// pintar el shell y resolver el i18n admin.
//
// Todavía no llama a ningún endpoint porque el backend de orquestación no existe (llega en 4.5:
// `GET /admin/save/orchestration/dashboard`). Cuando exista, este `data()` trae el dashboard acá,
// igual que `providers/+data.ts`. Un fetch inventado ahora sería una UI con datos falsos.
export async function data(pageContext: PageContextServer): Promise<AdminShellData> {
  return adminShellData(pageContext);
}
