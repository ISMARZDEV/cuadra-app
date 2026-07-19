import type { ProviderFlowDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { runQueueHref } from "./run-queue-href";

// Deep-link corrida→cola (F4 #4.7): el número "a la cola" de un flow enlaza a la cola de revisión
// filtrada por ESA corrida (`?run_id=`). El helper decide cuándo el número es clicable — la regla
// de honestidad: solo si la corrida existe (`last_run_id`) Y dejó algo a la cola (`queued > 0`).
// Un 0 clicable llevaría a una cola vacía; un link sin `run_id` no filtraría nada.
function flow(over: Partial<ProviderFlowDto>): ProviderFlowDto {
  return {
    provider_name: "Sirena",
    provider_logo_url: null,
    policy: {} as ProviderFlowDto["policy"],
    last_run_metrics: null,
    last_run_state: null,
    last_run_id: null,
    ...over,
  };
}

function metrics(queued: number): ProviderFlowDto["last_run_metrics"] {
  return {
    seen: 0,
    refreshed: 0,
    matched: 0,
    auto_linked: 0,
    queued_for_review: queued,
    discarded: 0,
    new_canonicals: 0,
  };
}

describe("runQueueHref", () => {
  it("links a run that left items in the queue to the filtered review queue", () => {
    const href = runQueueHref(flow({ last_run_id: "run-abc", last_run_metrics: metrics(40) }));
    expect(href).toBe("/admin/review-queue?run_id=run-abc");
  });

  it("returns null when the run queued nothing (a 0 link would land on an empty queue)", () => {
    expect(runQueueHref(flow({ last_run_id: "run-abc", last_run_metrics: metrics(0) }))).toBeNull();
  });

  it("returns null when there is no run id (a link without run_id would not filter)", () => {
    expect(runQueueHref(flow({ last_run_id: null, last_run_metrics: metrics(40) }))).toBeNull();
  });

  it("returns null when there are no run metrics at all (runner down / never ran)", () => {
    expect(runQueueHref(flow({ last_run_id: "run-abc", last_run_metrics: null }))).toBeNull();
  });

  it("encodes the run id so an exotic id can't break the query string", () => {
    const href = runQueueHref(flow({ last_run_id: "a b/c", last_run_metrics: metrics(3) }));
    expect(href).toBe("/admin/review-queue?run_id=a%20b%2Fc");
  });
});
