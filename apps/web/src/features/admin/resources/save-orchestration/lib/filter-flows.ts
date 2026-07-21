import type { ProviderFlowDto } from "@cuadra/api-client";

export interface FlowFilters {
  /** Texto libre: matchea nombre de proveedor y `flow_key`. */
  search: string;
  /** `undefined` = todos. */
  mode?: string;
  /** `undefined` = todos. `"never"` = configurado pero nunca disparado. */
  state?: string;
}

/** Estado sintético para "nunca corrió". NO es un hueco: es el estado que el operador busca para
 * saber qué dejó configurado y nunca ejecutó. Se filtra igual que cualquier otro. */
export const NEVER_RAN = "never";

/**
 * Filtro CLIENT-SIDE de provider-flows.
 *
 * Client-side a propósito: el endpoint devuelve la lista completa (son unidades, no miles) y sumarle
 * parámetros de query al backend por una tabla de este tamaño sería complejidad sin beneficio. Si
 * algún día la lista crece, esta función es el único lugar que cambia de lado.
 *
 * Search y filtros se combinan con AND: cada control ACOTA el resultado, nunca lo amplía.
 */
export function filterFlows(flows: ProviderFlowDto[], f: FlowFilters): ProviderFlowDto[] {
  const needle = f.search.trim().toLowerCase();

  return flows.filter((flow) => {
    if (needle) {
      const haystack = `${flow.provider_name ?? ""} ${flow.policy.flow_key ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (f.mode && flow.policy.execution_mode !== f.mode) return false;
    if (f.state) {
      const state = flow.last_run_state ?? NEVER_RAN;
      if (state !== f.state) return false;
    }
    return true;
  });
}
