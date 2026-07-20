import {
  cancelRun as cancelRunRequest,
  createProviderFlow as createProviderFlowRequest,
  deletePolicy as deletePolicyRequest,
  listAssets as listAssetsRequest,
  listProviderFlows as listProviderFlowsRequest,
  pausePolicy as pausePolicyRequest,
  resumePolicy as resumePolicyRequest,
  retryRun as retryRunRequest,
  runPolicyNow as runPolicyNowRequest,
  updatePolicy as updatePolicyRequest,
} from "@cuadra/api-client";
import type {
  AssetAdminRowDto,
  CreateProviderFlowRequest,
  ProviderFlowDto,
  UpdatePolicyRequest,
} from "@cuadra/api-client";

import { authHeaders } from "@/features/save/hooks/use-auth";
import { apiClient } from "@/lib/api";

// Wrappers finos sobre el cliente generado — MISMO mecanismo de auth que el resto del admin
// (`authHeaders()`, token async). Sin TanStack Query en web: la lista viene por SSR (`+data.ts`) y
// se refresca con `useAdminList` tras cada mutación.

export async function listProviderFlowEntries(): Promise<ProviderFlowDto[]> {
  const res = await listProviderFlowsRequest({ client: apiClient, headers: await authHeaders() });
  return res.data?.flows ?? [];
}

export async function runPolicy(policyId: string) {
  return runPolicyNowRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { policy_id: policyId },
  });
}

export async function pausePolicy(policyId: string) {
  return pausePolicyRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { policy_id: policyId },
  });
}

export async function resumePolicy(policyId: string) {
  return resumePolicyRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { policy_id: policyId },
  });
}

export async function retryRun(runId: string) {
  return retryRunRequest({ client: apiClient, headers: await authHeaders(), path: { run_id: runId } });
}

export async function cancelRun(runId: string) {
  return cancelRunRequest({ client: apiClient, headers: await authHeaders(), path: { run_id: runId } });
}

/** Soft-delete (`deleted_at`). NUNCA hard-delete: el histórico de corridas referencia esta policy
 * y es append-only y sagrado (§5.3). El backend ya lo resuelve así; acá solo se expone. */
export async function deletePolicy(policyId: string) {
  return deletePolicyRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { policy_id: policyId },
  });
}

export async function updatePolicy(policyId: string, body: UpdatePolicyRequest) {
  return updatePolicyRequest({
    client: apiClient,
    headers: await authHeaders(),
    path: { policy_id: policyId },
    body,
  });
}

export async function createProviderFlow(body: CreateProviderFlowRequest) {
  return createProviderFlowRequest({ client: apiClient, headers: await authHeaders(), body });
}

/** Assets del pipeline (§14 #9).
 *
 * NO se carga por SSR en `+data.ts` a propósito: los assets viven SOLO en Dagster, así que un runner
 * caído responde 503 y eso tumbaría la consola ENTERA — incluidas las policies, que viven en nuestra
 * DB y tienen que seguir visibles justo cuando el runner falla (SDD §8). Cargándolo al abrir la tab,
 * un runner muerto degrada SOLO esta pestaña.
 *
 * Lanza `AssetsUnavailable` en vez de devolver `[]`: una lista vacía diría "el pipeline no tiene
 * assets" cuando la verdad es "no pudimos preguntar".
 */
export class AssetsUnavailable extends Error {}

export async function listPipelineAssets(): Promise<AssetAdminRowDto[]> {
  const res = await listAssetsRequest({ client: apiClient, headers: await authHeaders() });
  if (res.error || !res.data) throw new AssetsUnavailable("el orquestador no respondió");
  return res.data.assets;
}
