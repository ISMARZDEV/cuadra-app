import type { ProviderOrchestrationDetailDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockData: {
  detail: ProviderOrchestrationDetailDto;
  initialRuns?: unknown[];
  initialCursor?: string | null;
  runsAvailable?: boolean;
  locale?: string;
};
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const api = vi.hoisted(() => ({
  getProviderDetail: vi.fn(),
  listProviderRuns: vi.fn(),
  runPolicy: vi.fn(),
  retryRun: vi.fn(),
  cancelRun: vi.fn(),
  pausePolicy: vi.fn(),
  resumePolicy: vi.fn(),
  updatePolicy: vi.fn(),
}));
vi.mock("../api", () => api);

import { ProviderDetailScreen } from "./ProviderDetailScreen";

function detail(over: Partial<ProviderOrchestrationDetailDto> = {}): ProviderOrchestrationDetailDto {
  return {
    provider_id: "prov-1",
    provider_name: "Sirena",
    provider_logo_url: null,
    market_id: "DO",
    flow_key: "provider_prices_refresh",
    policy: {
      policy_id: "pol-1",
      provider_id: "prov-1",
      market_id: "DO",
      flow_key: "provider_prices_refresh",
      execution_mode: "manual",
      cron_expression: null,
      timezone: "America/Santo_Domingo",
      sla_minutes: null,
      query_limit_override: null,
      enabled: true,
      next_run_at: null,
    },
    runner_available: true,
    current_run: null,
    last_successful_run: null,
    sla_status: "not_applicable",
    last_sync_at: null,
    next_run_at: null,
    resolved_query_limit: null,
    result_summary: null,
    ...over,
  } as ProviderOrchestrationDetailDto;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getProviderDetail.mockResolvedValue({ data: detail() });
  api.listProviderRuns.mockResolvedValue({ data: { runs: [], next_cursor: null } });
  api.runPolicy.mockResolvedValue({});
  api.pausePolicy.mockResolvedValue({});
});

describe("ProviderDetailScreen", () => {
  it("shows the provider identity with a READABLE flow name, not the raw key", () => {
    mockData = { detail: detail(), locale: "es" };
    render(<ProviderDetailScreen />);

    expect(screen.getByRole("heading", { name: "Sirena" })).toBeInTheDocument();
    expect(screen.getByText("Descubrimiento por búsqueda")).toBeInTheDocument();
  });

  it("shows WHO triggered the last run (US-OR-D2)", () => {
    mockData = {
      detail: detail({
        current_run: {
          run_id: "r-1", state: "succeeded", trigger: "manual",
          started_at: "2026-07-19T16:00:00Z", ended_at: "2026-07-19T16:04:00Z",
          duration_seconds: 240,
        },
      }),
      locale: "es",
    };
    render(<ProviderDetailScreen />);

    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("DECLARES a downed runner instead of inferring it from missing metrics (US-OR-D5)", () => {
    mockData = { detail: detail({ runner_available: false }), locale: "es" };
    render(<ProviderDetailScreen />);

    expect(screen.getByTestId("detail-runner-down")).toBeInTheDocument();
  });

  it("renders the SSR-seeded history WITHOUT a client fetch (US-OR-D6)", () => {
    // El histórico llega por SSR (`+data.ts`), no por un `useEffect`. Antes se pedía al montar y en
    // un refresh el token de auth todavía no estaba listo → la tabla salía vacía. Sembrarlo desde el
    // server (que sí tiene el token de la cookie) elimina la carrera.
    mockData = {
      detail: detail(),
      initialRuns: [
        {
          run_id: "r-1", state: "succeeded", trigger: "manual",
          started_at: null, ended_at: "2026-07-19T16:00:00Z", duration_seconds: 12,
        },
      ],
      initialCursor: null,
      runsAvailable: true,
      locale: "es",
    };
    render(<ProviderDetailScreen />);

    expect(api.listProviderRuns).not.toHaveBeenCalled();
    expect(screen.getByTestId("history-pagination-range")).toHaveTextContent("1–1 de 1");
  });

  it("declares an UNAVAILABLE history (runner down at SSR), not a false 'empty'", () => {
    // `runsAvailable=false` no es "sin corridas": el histórico vive solo en el runner. Se declara y
    // la config de arriba sigue visible.
    mockData = { detail: detail(), initialRuns: [], runsAvailable: false, locale: "es" };
    render(<ProviderDetailScreen />);

    expect(screen.getByText(/No pudimos consultar el histórico/)).toBeInTheDocument();
  });

  it("does NOT offer retry on a successful run — FROM_FAILURE would 503", () => {
    mockData = {
      detail: detail({
        current_run: {
          run_id: "r-1", state: "succeeded", trigger: "manual",
          started_at: null, ended_at: null, duration_seconds: null,
        },
      }),
      locale: "es",
    };
    render(<ProviderDetailScreen />);

    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("runs the flow and reloads the detail (US-OR-D8)", async () => {
    mockData = { detail: detail(), locale: "es" };
    render(<ProviderDetailScreen />);

    fireEvent.click(screen.getByText("Ejecutar ahora"));

    await waitFor(() => expect(api.runPolicy).toHaveBeenCalledWith("pol-1"));
    await waitFor(() => expect(api.getProviderDetail).toHaveBeenCalled());
  });
});
