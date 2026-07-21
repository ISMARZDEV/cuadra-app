import type { ProviderDto, ProviderFlowDto } from "@cuadra/api-client";

// Tipo de los datos SSR — vive en la FEATURE, no en la página: si viviera en `+data.ts`, la screen
// dependería hacia atrás de `pages/`. El `+data.ts` lo RE-EXPORTA.
export interface OrchestrationData {
  flows: ProviderFlowDto[];
  /** El runner no respondió: la política se ve igual, las métricas no. */
  runnerDisconnected: boolean;
  /**
   * Proveedores del mercado para el select del modal de creación.
   *
   * Sale del endpoint **ADMIN** (`listAdminProviders`), NO del público `listProviders`: §5.1 del
   * plan maestro manda retirar el consumo del endpoint público desde el admin ahora que existe el
   * DTO admin completo. Este módulo nace cumpliéndolo en vez de heredar la deuda.
   */
  providers: ProviderDto[];
}
