import type { ProviderFlowDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { filterFlows } from "./filter-flows";

function flow(name: string, over: Partial<ProviderFlowDto> = {}): ProviderFlowDto {
  return {
    provider_name: name,
    provider_logo_url: null,
    policy: {
      policy_id: `pol-${name}`,
      provider_id: `prov-${name}`,
      flow_key: "provider_prices_refresh",
      execution_mode: "manual",
      cron_expression: null,
      timezone: "America/Santo_Domingo",
      enabled: true,
      next_run_at: null,
    } as ProviderFlowDto["policy"],
    last_run_metrics: null,
    last_run_state: null,
    last_run_id: null,
    ...over,
  } as ProviderFlowDto;
}

const FLOWS = [
  flow("Sirena", { last_run_state: "succeeded" }),
  flow("Bravo", { last_run_state: "failed" }),
  flow("Nacional", {
    last_run_state: null,
    policy: { ...flow("Nacional").policy, execution_mode: "cron" },
  }),
];

const NONE = { search: "", mode: undefined, state: undefined };

describe("filterFlows", () => {
  it("returns everything when nothing is filtered", () => {
    expect(filterFlows(FLOWS, NONE)).toHaveLength(3);
  });

  it("matches the provider name case-insensitively", () => {
    expect(filterFlows(FLOWS, { ...NONE, search: "bra" }).map((f) => f.provider_name)).toEqual([
      "Bravo",
    ]);
  });

  it("matches the flow key too — the operator searches by what he sees", () => {
    expect(filterFlows(FLOWS, { ...NONE, search: "prices_refresh" })).toHaveLength(3);
  });

  it("ignores surrounding whitespace instead of returning nothing", () => {
    expect(filterFlows(FLOWS, { ...NONE, search: "  sirena  " })).toHaveLength(1);
  });

  it("filters by execution mode", () => {
    expect(filterFlows(FLOWS, { ...NONE, mode: "cron" }).map((f) => f.provider_name)).toEqual([
      "Nacional",
    ]);
  });

  it("filters by last run state", () => {
    expect(filterFlows(FLOWS, { ...NONE, state: "failed" }).map((f) => f.provider_name)).toEqual([
      "Bravo",
    ]);
  });

  it("treats a flow that never ran as the `never` state, not as a missing value", () => {
    // "Sin corridas" es un estado operativo REAL y filtrable — no un hueco. Es justo el que el
    // operador busca para saber qué configuró y nunca disparó.
    expect(filterFlows(FLOWS, { ...NONE, state: "never" }).map((f) => f.provider_name)).toEqual([
      "Nacional",
    ]);
  });

  it("combines search and filters (AND, not OR)", () => {
    expect(filterFlows(FLOWS, { ...NONE, search: "sirena", state: "failed" })).toHaveLength(0);
  });
});
