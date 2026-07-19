import type { ProviderFlowDto } from "@cuadra/api-client";

// Tipo de los datos SSR — vive en la FEATURE, no en la página: si viviera en `+data.ts`, la screen
// dependería hacia atrás de `pages/`. El `+data.ts` lo RE-EXPORTA.
export interface OrchestrationData {
  flows: ProviderFlowDto[];
  /** El runner no respondió: la política se ve igual, las métricas no. */
  runnerDisconnected: boolean;
}
