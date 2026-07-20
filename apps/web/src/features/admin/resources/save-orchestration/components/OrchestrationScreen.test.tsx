import type { ProviderFlowDto } from "@cuadra/api-client";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrchestrationData } from "../interfaces";

// La screen lee vía `useData` (patrón vike-react) y las acciones viven en `../api` (que importa el
// api-client) — se mockean, mismo patrón que `ReviewQueueListScreen.test.tsx`. `useAdminList` NO
// hace fetch en mount (siembra del prop SSR), así que no se dispara ninguna llamada al renderizar.
let mockData: OrchestrationData & { locale?: string };
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

// `vi.hoisted` porque la factory de `vi.mock` se iza al tope del archivo: una const normal todavía
// no existe cuando la factory corre.
const api = vi.hoisted(() => ({
  listProviderFlowEntries: vi.fn(),
  runPolicy: vi.fn(),
  pausePolicy: vi.fn(),
  resumePolicy: vi.fn(),
  cancelRun: vi.fn(),
  retryRun: vi.fn(),
  deletePolicy: vi.fn(),
}));
vi.mock("../api", () => api);

import { OrchestrationScreen } from "./OrchestrationScreen";

function flow(over: Partial<ProviderFlowDto> = {}): ProviderFlowDto {
  return {
    provider_name: "Sirena",
    provider_logo_url: null,
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
    } as ProviderFlowDto["policy"],
    last_run_metrics: null,
    last_run_state: null,
    last_run_id: null,
    ...over,
  };
}

function metrics(over: Partial<NonNullable<ProviderFlowDto["last_run_metrics"]>> = {}) {
  return {
    seen: 0,
    refreshed: 0,
    matched: 0,
    auto_linked: 5,
    queued_for_review: 0,
    discarded: 0,
    new_canonicals: 0,
    ...over,
  } as NonNullable<ProviderFlowDto["last_run_metrics"]>;
}

/** Abre el menú de acciones de la primera fila y devuelve su contenido. */
function openRowMenu() {
  fireEvent.click(screen.getAllByTestId("orchestration-row-menu")[0]);
  return screen.getByRole("menu");
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listProviderFlowEntries.mockImplementation(async () => mockData.flows);
  api.runPolicy.mockResolvedValue({});
  api.pausePolicy.mockResolvedValue({});
  api.resumePolicy.mockResolvedValue({});
  api.cancelRun.mockResolvedValue({});
  api.retryRun.mockResolvedValue({});
  api.deletePolicy.mockResolvedValue({});
});

describe("OrchestrationScreen — deep-link corrida→cola (F4 #4.7)", () => {
  it("turns the 'queued' number into a link to the review queue filtered by that run", () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_metrics: metrics({ queued_for_review: 40 }) })],
    };

    render(<OrchestrationScreen />);

    const link = screen.getByRole("link", { name: /40/ });
    expect(link).toHaveAttribute("href", "/admin/review-queue?run_id=run-abc");
  });

  it("renders the queued count as plain text (no link) when the run queued nothing", () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_metrics: metrics({ queued_for_review: 0 }) })],
    };

    render(<OrchestrationScreen />);

    // Acotado a la TABLA: el KPI de auto-enlace también rotula "0 a la cola" en su badge, y esta
    // aserción es sobre la fila, no sobre el resumen de arriba.
    const table = within(screen.getByRole("table"));
    // El "0 a la cola" se muestra pero NUNCA como link (un 0 clicable llevaría a una cola vacía).
    expect(table.queryByRole("link", { name: /a la cola/ })).not.toBeInTheDocument();
    expect(table.getByText(/0 a la cola/)).toBeInTheDocument();
  });
});

describe("OrchestrationScreen — métricas que YA viajan en el DTO", () => {
  it("paints seen/refreshed/matched/discarded instead of discarding them", () => {
    // Estos cuatro campos ya venían en `RunMetricsDto` desde F4 y la tabla no los mostraba: la
    // señal se calculaba, viajaba por la red, y se tiraba en el render. Es el caso exacto del
    // corolario de la fase: "si un valor se calcula y nadie lo lee, se pierde en un tramo intermedio".
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [
        flow({
          last_run_id: "run-abc",
          last_run_metrics: metrics({ seen: 120, refreshed: 87, matched: 61, discarded: 12 }),
        }),
      ],
    };

    render(<OrchestrationScreen />);

    const cell = screen.getByTestId("orchestration-products");
    expect(cell).toHaveTextContent("120");
    expect(cell).toHaveTextContent("87");
    expect(cell).toHaveTextContent("61");
    expect(cell).toHaveTextContent("12");
  });

  it("shows an honest dash when the runner could not be asked", () => {
    // `—` y NUNCA `0`: un cero dice "corrió y no encontró nada"; la verdad es "no pudimos preguntar".
    mockData = { runnerDisconnected: true, providers: [], locale: "es", flows: [flow()] };

    render(<OrchestrationScreen />);

    expect(screen.getByTestId("orchestration-products")).toHaveTextContent("—");
  });
});

describe("OrchestrationScreen — menú de acciones", () => {
  it("wires 'Reintentar' to the endpoint that already existed but nobody called", () => {
    // `retryRun` existía en `api.ts` y el endpoint estaba auditado, pero la screen no lo importaba:
    // código zombi en la capa UI (plan maestro §5.2).
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "failed" })],
    };

    render(<OrchestrationScreen />);
    fireEvent.click(within(openRowMenu()).getByText("Reintentar"));

    expect(api.retryRun).toHaveBeenCalledWith("run-abc");
  });

  it("does not offer 'Reintentar' when there is no run to retry", () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: null })],
    };

    render(<OrchestrationScreen />);

    expect(within(openRowMenu()).queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("offers 'Cancelar' only while the run is in flight", () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "succeeded" })],
    };

    render(<OrchestrationScreen />);

    expect(within(openRowMenu()).queryByText("Cancelar corrida")).not.toBeInTheDocument();
  });
});

describe("OrchestrationScreen — confirmación fuerte", () => {
  it("does NOT cancel a live run on the first click — it asks first", () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "running" })],
    };

    render(<OrchestrationScreen />);
    fireEvent.click(within(openRowMenu()).getByText("Cancelar corrida"));

    // El clic abre el diálogo; la mutación todavía NO salió.
    expect(api.cancelRun).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancels once the operator confirms", async () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "running" })],
    };

    render(<OrchestrationScreen />);
    fireEvent.click(within(openRowMenu()).getByText("Cancelar corrida"));
    fireEvent.click(within(screen.getByRole("dialog")).getByTestId("confirm-accept"));

    await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith("run-abc"));
  });

  it("asks before deleting a flow, and explains that history survives", () => {
    mockData = { runnerDisconnected: false, providers: [], locale: "es", flows: [flow()] };

    render(<OrchestrationScreen />);
    fireEvent.click(within(openRowMenu()).getByText("Eliminar flujo"));

    expect(api.deletePolicy).not.toHaveBeenCalled();
    // Soft-delete: el histórico de corridas es append-only y sagrado (§5.3). El copy debe decirlo.
    expect(screen.getByRole("dialog")).toHaveTextContent(/histórico/i);
  });
});

describe("OrchestrationScreen — paginación", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      flow({
        provider_name: `P${i}`,
        policy: { ...flow().policy, policy_id: `pol-${i}` } as ProviderFlowDto["policy"],
      }),
    );

  it("corta a la página actual en vez de volcar toda la lista", () => {
    mockData = { runnerDisconnected: false, providers: [], locale: "es", flows: many(12) };

    render(<OrchestrationScreen />);

    // 12 filas, 10 por página → 10 menús de fila (uno por fila renderizada).
    expect(screen.getAllByTestId("orchestration-row-menu")).toHaveLength(10);
    expect(screen.getByTestId("pagination-range")).toHaveTextContent("1–10 de 12");
  });

  it("el rango cuenta lo FILTRADO, no la lista cruda", () => {
    // Si el rango dijera "de 12" con 1 fila visible, el operador creería que la tabla se rompió.
    mockData = { runnerDisconnected: false, providers: [], locale: "es", flows: many(12) };

    render(<OrchestrationScreen />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "P3" } });

    expect(screen.getByTestId("pagination-range")).toHaveTextContent("1–1 de 1");
  });
});

describe("OrchestrationScreen — filtros", () => {
  it("avisa que la tabla está filtrada aunque el menú esté cerrado", () => {
    // Una tabla filtrada que parece completa es un dato falso: el operador saca conclusiones sobre
    // un subconjunto creyendo que es el total.
    mockData = { runnerDisconnected: false, providers: [], locale: "es", flows: [flow()] };

    render(<OrchestrationScreen />);
    expect(screen.queryByTestId("filters-active-dot")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByLabelText("Modo de ejecución"));
    fireEvent.click(screen.getByRole("option", { name: "Programado" }));
    fireEvent.click(screen.getByTestId("filters-apply"));

    expect(screen.getByTestId("filters-active-dot")).toHaveTextContent("1");
  });

  it("no filtra hasta que se aplica — el borrador no toca la tabla", () => {
    // Aplicación DIFERIDA: cambiar un select no debe re-filtrar bajo el cursor del operador.
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ provider_name: "Sirena" })],
    };

    render(<OrchestrationScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByLabelText("Modo de ejecución"));
    fireEvent.click(screen.getByRole("option", { name: "Programado" }));

    // El flujo es `manual`: si el filtro se hubiera aplicado solo, la fila ya no estaría.
    expect(within(screen.getByRole("table")).getByText("Sirena")).toBeInTheDocument();
    expect(screen.queryByTestId("filters-active-dot")).not.toBeInTheDocument();
  });
});

describe("OrchestrationScreen — refresco en vivo", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("keeps polling while a run is in flight", async () => {
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "running" })],
    };

    render(<OrchestrationScreen />);
    expect(api.listProviderFlowEntries).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(api.listProviderFlowEntries).toHaveBeenCalled();
  });

  it("does NOT poll when every run reached a terminal state", async () => {
    // Sin esta guarda la consola machacaría el runner para siempre con la tabla quieta.
    mockData = {
      runnerDisconnected: false,
      providers: [],
      locale: "es",
      flows: [flow({ last_run_id: "run-abc", last_run_state: "succeeded" })],
    };

    render(<OrchestrationScreen />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(api.listProviderFlowEntries).not.toHaveBeenCalled();
  });
});
