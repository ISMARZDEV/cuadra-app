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
  listPipelineAssets: vi.fn(),
  AssetsUnavailable: class extends Error {},
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
  // Solo los MOCKS se resetean: el módulo `../api` también exporta la clase `AssetsUnavailable`, y
  // un `Object.values(...).forEach(fn => fn.mockReset())` a ciegas revienta con ella.
  Object.values(api).forEach((fn) => {
    if (typeof (fn as { mockReset?: unknown }).mockReset === "function") {
      (fn as { mockReset: () => void }).mockReset();
    }
  });
  api.listProviderFlowEntries.mockImplementation(async () => mockData.flows);
  api.runPolicy.mockResolvedValue({});
  api.pausePolicy.mockResolvedValue({});
  api.resumePolicy.mockResolvedValue({});
  api.cancelRun.mockResolvedValue({});
  api.retryRun.mockResolvedValue({});
  api.deletePolicy.mockResolvedValue({});
  api.listPipelineAssets.mockResolvedValue([]);
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

    // El link es la etiqueta "Pendientes" (el destino accionable), y su número acompaña arriba.
    const link = screen.getByRole("link", { name: /Pendientes/i });
    expect(link).toHaveAttribute("href", "/admin/review-queue?run_id=run-abc");
    expect(screen.getByTestId("orchestration-products")).toHaveTextContent("40");
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
    // "Pendientes" se muestra pero NUNCA como link (un 0 clicable llevaría a una cola vacía).
    expect(table.queryByRole("link", { name: /Pendientes/i })).not.toBeInTheDocument();
    const cell = within(table.getByTestId("orchestration-products"));
    expect(cell.getByText(/Pendientes/i)).toBeInTheDocument();
    expect(cell.getByTestId("help-pending")).toHaveTextContent(/Pendientes/i);
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

    // `seen` (120) es progreso; refreshed/matched y los descartados son resultado.
    expect(screen.getByTestId("orchestration-progress")).toHaveTextContent("120");
    const cell = screen.getByTestId("orchestration-products");
    expect(cell).toHaveTextContent("87"); // Existentes
    expect(cell).toHaveTextContent("61"); // Nuevos
    expect(cell).toHaveTextContent("12"); // descartados (chip)
  });

  it("shows an honest dash when the runner could not be asked", () => {
    // `—` y NUNCA `0`: un cero dice "corrió y no encontró nada"; la verdad es "no pudimos preguntar".
    mockData = { runnerDisconnected: true, providers: [], locale: "es", flows: [flow()] };

    render(<OrchestrationScreen />);

    expect(screen.getByTestId("orchestration-products")).toHaveTextContent("—");
  });
});

/** La corrida real de Bravo (2026-07-21) — los números que hicieron dudar al operador. */
const BRAVO = { seen: 100, refreshed: 19, matched: 81, auto_linked: 13, queued_for_review: 68 };

function renderFunnel(over: Partial<typeof BRAVO> = {}) {
  mockData = {
    runnerDisconnected: false,
    providers: [],
    locale: "es",
    flows: [flow({ last_run_id: "run-abc", last_run_metrics: metrics({ ...BRAVO, ...over }) })],
  };
  render(<OrchestrationScreen />);
  return screen.getByTestId("orchestration-products");
}

describe("OrchestrationScreen — resultado de la corrida", () => {
  it("nunca llama «matcheados» a los enrutados a la cascada", () => {
    // EL bug de comprensión que originó el rediseño: `matched` significa "desconocidos ENRUTADOS a
    // la cascada", pero el chip decía "81 Matcheados" y se lee como "81 emparejados con éxito"
    // cuando solo 13 lo fueron. Ahora es "Nuevos": un hecho de origen, no un resultado.
    const cell = renderFunnel();

    expect(cell).toHaveTextContent(/Nuevos/i);
    expect(cell.textContent ?? "").not.toMatch(/matchead/i);
  });

  it("muestra los cuatro destinos con sus números", () => {
    const cell = renderFunnel();

    for (const [n, label] of [
      ["19", /Existentes/i],
      ["13", /Vinculados/i],
      ["81", /Nuevos/i],
      ["68", /Pendientes/i],
    ] as const) {
      expect(cell).toHaveTextContent(n);
      expect(cell).toHaveTextContent(label);
    }
  });

  it("el TOTAL vive en Progreso, no en Resultado (cuánto se procesó ≠ en qué terminó)", () => {
    renderFunnel();

    // `seen` (100) se movió a la columna de progreso; su ayuda vive junto a él.
    const progress = screen.getByTestId("orchestration-progress");
    expect(progress).toHaveTextContent("100");
    expect(within(progress).getByTestId("help-seen")).toBeInTheDocument();
  });

  it("dimensiona cada tramo según su proporción sobre la suma de los cuatro", () => {
    // La barra normaliza sobre 19+13+81+68=181 (nota de dato: `Nuevos` solapa con
    // `Vinculados`+`Pendientes`; comunica proporción relativa, no partición exacta).
    const cell = renderFunnel();
    const pct = (n: number) => `${(n / 181) * 100}%`;

    expect(within(cell).getByTestId("funnel-seg-existing")).toHaveStyle({ width: pct(19) });
    expect(within(cell).getByTestId("funnel-seg-linked")).toHaveStyle({ width: pct(13) });
    expect(within(cell).getByTestId("funnel-seg-new")).toHaveStyle({ width: pct(81) });
    expect(within(cell).getByTestId("funnel-seg-pending")).toHaveStyle({ width: pct(68) });
  });

  it("omite el tramo de un destino en cero, pero conserva su columna en la leyenda", () => {
    // Un tramo de ancho 0 sería una franja invisible; el número (0) sí debe verse en la leyenda.
    const cell = renderFunnel({ auto_linked: 0 });

    expect(within(cell).queryByTestId("funnel-seg-linked")).not.toBeInTheDocument();
    expect(within(cell).getByTestId("help-linked")).toBeInTheDocument();
  });

  it("cada destino explica su concepto con un tooltip en su etiqueta", () => {
    const cell = renderFunnel();

    for (const id of ["help-existing", "help-linked", "help-new", "help-pending"]) {
      expect(within(cell).getByTestId(id)).toBeInTheDocument();
    }
  });

  it("explica el embudo UNA vez en la cabecera, no una vez por fila", () => {
    // El concepto no cambia de una fila a otra: repetir su ayuda por celda pintaría decenas de
    // íconos idénticos. En la cabecera va una sola vez, pase la tabla las filas que pase.
    renderFunnel();

    expect(screen.getAllByTestId("run-funnel-help")).toHaveLength(1);
  });

  it("no pinta ni un ícono suelto de ayuda dentro de la celda de resultado", () => {
    // La etiqueta ES el disparador (subrayado punteado). Un `ⓘ` por destino serían 4 glifos por
    // fila explicando algo que ya explica la cabecera.
    const cell = renderFunnel();

    expect(cell.querySelectorAll("svg")).toHaveLength(0);
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


describe("OrchestrationScreen — la barra de tabs (§14 #10)", () => {
  it("does NOT ask the runner for assets while the Providers tab is open", async () => {
    // El costo de la tab tiene que pagarse solo cuando se usa. Pedirlos al montar haría que cada
    // visita a la consola golpeara al runner por datos que nadie está mirando.
    mockData = { flows: [flow()], runnerDisconnected: false, providers: [] };
    render(<OrchestrationScreen />);

    await screen.findByText("Sirena");
    expect(api.listPipelineAssets).not.toHaveBeenCalled();
  });

  it("switches to the Assets tab and asks the runner ONLY then", async () => {
    // El test de CABLEADO: `AssetsTab` puede estar perfecta y no abrirse nunca. Sin esto, la tab
    // podría no estar conectada y toda su suite seguiría verde.
    mockData = { flows: [flow()], runnerDisconnected: false, providers: [] };
    render(<OrchestrationScreen />);

    fireEvent.click(screen.getByTestId("orchestration-tab-assets"));

    await waitFor(() => expect(api.listPipelineAssets).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("orchestration-tab-assets")).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the policies reachable when the runner is down — they live in OUR DB", async () => {
    // La degradación que el SDD §8 exige: el operador vuelve a Proveedores y sigue viendo (y
    // pudiendo editar) su configuración aunque los assets no se hayan podido pedir.
    mockData = { flows: [flow()], runnerDisconnected: true, providers: [] };
    api.listPipelineAssets.mockRejectedValue(new Error("503"));
    render(<OrchestrationScreen />);

    fireEvent.click(screen.getByTestId("orchestration-tab-assets"));
    expect(await screen.findByTestId("assets-unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("orchestration-tab-flows"));
    expect(screen.getByText("Sirena")).toBeInTheDocument();
  });
});


describe("OrchestrationScreen — progreso por búsquedas (§14 #14)", () => {
  it("draws the progress bar from the QUERY counter, not from the product count", async () => {
    // `seen` cuenta productos DEVUELTOS: una búsqueda puede traer 40 o ninguno, así que jamás pudo
    // responder "¿por dónde va la corrida?".
    mockData = {
      flows: [flow({ last_run_metrics: metrics({ seen: 120, queries_total: 4, queries_processed: 3, query_progress: 0.75 }) })],
      runnerDisconnected: false,
      providers: [],
    };
    render(<OrchestrationScreen />);

    expect(await screen.findByTestId("orchestration-query-progress")).toHaveTextContent("3/4");
  });

  it("draws NOTHING when there is no plan to measure against", async () => {
    // Corridas anteriores al contador: `query_progress` viene null. Una barra al 0% ahí afirmaría
    // "no avanzó", que es distinto de "no lo sabemos".
    mockData = {
      flows: [flow({ last_run_metrics: metrics({ seen: 120 }) })],
      runnerDisconnected: false,
      providers: [],
    };
    render(<OrchestrationScreen />);

    await screen.findByText("Sirena");
    expect(screen.queryByTestId("orchestration-query-progress")).not.toBeInTheDocument();
  });
});


describe("OrchestrationScreen — la celda no queda muda mientras arranca la corrida", () => {
  it("declares 'Iniciando…' while the run is up but has produced no snapshot yet", async () => {
    // El hueco que el usuario vio: la consola decía "corriendo" y la celda estaba vacía, así que
    // parecía que no pasaba nada. El runner tarda segundos en levantar su proceso y hasta entonces
    // NO hay snapshot. Se declara en vez de dejar el vacío o pintar una barra al 0%.
    mockData = {
      flows: [flow({ last_run_state: "running", last_run_id: "run-x", last_run_metrics: null })],
      runnerDisconnected: false,
      providers: [],
    };
    render(<OrchestrationScreen />);

    // Vive en la columna PROGRESO, no en Productos: son dos preguntas distintas.
    expect(await screen.findByTestId("orchestration-products-starting")).toBeInTheDocument();
    expect(screen.getByTestId("orchestration-progress")).toHaveTextContent("Iniciando");
  });

  it("shows an honest dash — not 'starting' — when the flow simply never ran", async () => {
    // "Nunca corrió" y "arrancando" se ven igual si se infiere el estado de que falten métricas.
    // Lo declara el runner (`last_run_state`), no la ausencia de datos.
    mockData = {
      flows: [flow({ last_run_state: null, last_run_metrics: null })],
      runnerDisconnected: false,
      providers: [],
    };
    render(<OrchestrationScreen />);

    await screen.findByText("Sirena");
    expect(screen.queryByTestId("orchestration-products-starting")).not.toBeInTheDocument();
    expect(screen.getByTestId("orchestration-products")).toHaveTextContent("—");
    expect(screen.getByTestId("orchestration-progress")).toHaveTextContent("—");
  });
});


describe("OrchestrationScreen — última corrida (columna de fecha)", () => {
  it("shows WHEN the last run happened, whatever its outcome", async () => {
    // Distinto de `last_success_at`: un flujo que falla cada 5 minutos tiene una última corrida
    // fresquísima y una última sincronización vieja. El operador necesita ver las dos.
    mockData = {
      flows: [flow({ last_run_state: "failed", last_run_at: "2026-07-19T16:54:54Z" })],
      runnerDisconnected: false,
      providers: [],
      locale: "es",
    };
    render(<OrchestrationScreen />);

    const cell = await screen.findByTestId("orchestration-last-run");
    expect(cell).toHaveTextContent("4:54");           // 12h, como el resto del admin
    expect(cell.textContent?.toLowerCase()).toMatch(/p\.?\s?m\.?/);
  });

  it("shows an honest dash when the flow never ran", async () => {
    mockData = {
      flows: [flow({ last_run_at: null })],
      runnerDisconnected: false,
      providers: [],
      locale: "es",
    };
    render(<OrchestrationScreen />);

    expect(await screen.findByTestId("orchestration-last-run")).toHaveTextContent("—");
  });
});


describe("OrchestrationScreen — pausar y reintentar", () => {
  it("declares that a flow is PAUSED — the opacity alone was invisible", async () => {
    // Pausar funcionaba en el backend, pero en la tabla solo bajaba la opacidad de la fila mientras
    // el badge seguía diciendo "Exitosa". La acción parecía no hacer nada, y el badge la contradecía.
    mockData = {
      flows: [flow({ policy: { ...flow().policy, enabled: false }, last_run_state: "succeeded" })],
      runnerDisconnected: false,
      providers: [],
      locale: "es",
    };
    render(<OrchestrationScreen />);

    expect(await screen.findByTestId("orchestration-paused")).toBeInTheDocument();
  });

  it("does NOT offer 'Reintentar' on a SUCCESSFUL run", () => {
    // El adapter re-ejecuta con FROM_FAILURE: sin fallo del cual partir, Dagster devuelve
    // PythonError (500) y la consola lo traducía a "Orquestador no disponible" — culpando al runner
    // de una acción imposible que le pedíamos nosotros. Verificado contra el runner real.
    mockData = {
      flows: [flow({ last_run_id: "run-ok", last_run_state: "succeeded" })],
      runnerDisconnected: false,
      providers: [],
      locale: "es",
    };
    render(<OrchestrationScreen />);

    expect(within(openRowMenu()).queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("DOES offer 'Reintentar' after a failure", () => {
    mockData = {
      flows: [flow({ last_run_id: "run-bad", last_run_state: "failed" })],
      runnerDisconnected: false,
      providers: [],
      locale: "es",
    };
    render(<OrchestrationScreen />);

    expect(within(openRowMenu()).getByText("Reintentar")).toBeInTheDocument();
  });
});


describe("OrchestrationScreen — acciones en lote", () => {
  const twoFlows = () => [
    flow({ policy: { ...flow().policy, policy_id: "pol-a" } }),
    flow({ policy: { ...flow().policy, policy_id: "pol-b" } }),
  ];

  it("keeps the bulk menu disabled while nothing is selected", async () => {
    // Un menú que no puede hacer nada es un control decorativo.
    mockData = { flows: twoFlows(), runnerDisconnected: false, providers: [], locale: "es" };
    render(<OrchestrationScreen />);

    expect(await screen.findByTestId("orchestration-bulk-menu")).toBeDisabled();
  });

  it("runs ONLY the selected flows, one by one", async () => {
    // Secuencial y no en paralelo: cada lanzamiento dispara una corrida real contra las APIs de los
    // súper, y N a la vez es el martilleo que el `pace()` de la ingesta existe para evitar.
    mockData = { flows: twoFlows(), runnerDisconnected: false, providers: [], locale: "es" };
    render(<OrchestrationScreen />);

    fireEvent.click(await screen.findByTestId("orchestration-select-pol-a"));
    fireEvent.click(screen.getByTestId("orchestration-bulk-menu"));
    fireEvent.click(await screen.findByText("Ejecutar seleccionados"));

    await waitFor(() => expect(api.runPolicy).toHaveBeenCalledTimes(1));
    expect(api.runPolicy).toHaveBeenCalledWith("pol-a");
  });

  it("select-all marks only the VISIBLE page", async () => {
    // Marcar filas que el operador no está viendo y luego borrarlas en lote sería el peor final
    // posible de esta pantalla.
    mockData = { flows: twoFlows(), runnerDisconnected: false, providers: [], locale: "es" };
    render(<OrchestrationScreen />);

    fireEvent.click(await screen.findByTestId("orchestration-select-all"));

    expect(screen.getByTestId("orchestration-selected-count")).toHaveTextContent("2");
  });

  it("asks before deleting in bulk, and says HOW MANY", async () => {
    mockData = { flows: twoFlows(), runnerDisconnected: false, providers: [], locale: "es" };
    render(<OrchestrationScreen />);

    fireEvent.click(await screen.findByTestId("orchestration-select-all"));
    fireEvent.click(screen.getByTestId("orchestration-bulk-menu"));
    fireEvent.click(await screen.findByText("Eliminar seleccionados"));

    expect(await screen.findByText(/Eliminar 2 flujo/)).toBeInTheDocument();
    expect(api.deletePolicy).not.toHaveBeenCalled();
  });
});
