import type { ProviderFlowDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OrchestrationData } from "../interfaces";

// La screen lee vía `useData` (patrón vike-react) y las acciones viven en `../api` (que importa el
// api-client) — se mockean, mismo patrón que `ReviewQueueListScreen.test.tsx`. `useAdminList` NO
// hace fetch en mount (siembra del prop SSR), así que no se dispara ninguna llamada al renderizar.
let mockData: OrchestrationData & { locale?: string };
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
vi.mock("../api", () => ({
  listProviderFlowEntries: vi.fn(),
  runPolicy: vi.fn(),
  pausePolicy: vi.fn(),
  resumePolicy: vi.fn(),
  cancelRun: vi.fn(),
}));

import { OrchestrationScreen } from "./OrchestrationScreen";

function flow(over: Partial<ProviderFlowDto>): ProviderFlowDto {
  return {
    provider_name: "Sirena",
    provider_logo_url: null,
    policy: {
      policy_id: "pol-1",
      provider_id: "prov-1",
      flow_key: "provider_prices_refresh",
      execution_mode: "manual",
      cron_expression: null,
      timezone: "America/Santo_Domingo",
      sla_minutes: null,
      query_limit_override: null,
      enabled: true,
      next_run_at: null,
    } as ProviderFlowDto["policy"],
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
    auto_linked: 5,
    queued_for_review: queued,
    discarded: 0,
    new_canonicals: 0,
  };
}

describe("OrchestrationScreen — deep-link corrida→cola (F4 #4.7)", () => {
  it("turns the 'queued' number into a link to the review queue filtered by that run", () => {
    mockData = {
      runnerDisconnected: false,
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_metrics: metrics(40) })],
    };

    render(<OrchestrationScreen />);

    const link = screen.getByRole("link", { name: /40/ });
    expect(link).toHaveAttribute("href", "/admin/review-queue?run_id=run-abc");
  });

  it("renders the queued count as plain text (no link) when the run queued nothing", () => {
    mockData = {
      runnerDisconnected: false,
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_metrics: metrics(0) })],
    };

    render(<OrchestrationScreen />);

    // El "0 a la cola" se muestra pero NUNCA como link (un 0 clicable llevaría a una cola vacía).
    expect(screen.queryByRole("link", { name: /a la cola/ })).not.toBeInTheDocument();
    expect(screen.getByText(/0 a la cola/)).toBeInTheDocument();
  });
});
