import {
  cancelRun as cancelRunRequest,
  listProviderFlows as listProviderFlowsRequest,
  pausePolicy as pausePolicyRequest,
  resumePolicy as resumePolicyRequest,
  retryRun as retryRunRequest,
  runPolicyNow as runPolicyNowRequest,
} from "@cuadra/api-client";
import type { ProviderFlowDto } from "@cuadra/api-client";

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
