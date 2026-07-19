import type { ProviderFlowDto } from "@cuadra/api-client";

// Deep-link corrida→cola (F4 #4.7). PURA (sin React/DOM): dado un flow de la consola de
// Orquestación, devuelve el link a la cola de revisión filtrada por SU última corrida
// (`/admin/review-queue?run_id=`), o `null` cuando el número "a la cola" NO debe ser clicable.
//
// La regla de honestidad (la misma que rige toda la consola): solo enlaza si la corrida existe
// (`last_run_id`) Y dejó algo a la cola (`queued_for_review > 0`). Un `0` clicable llevaría a una
// cola vacía; un link sin `run_id` no filtraría nada. El `run_id` se codifica para que un id
// exótico no rompa el query string.
export function runQueueHref(flow: ProviderFlowDto): string | null {
  const queued = flow.last_run_metrics?.queued_for_review ?? 0;
  if (!flow.last_run_id || queued <= 0) return null;
  return `/admin/review-queue?run_id=${encodeURIComponent(flow.last_run_id)}`;
}
