import type { ProviderFlowDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ updatePolicy: vi.fn() }));
vi.mock("../api", () => api);

import { PolicyModal } from "./PolicyModal";

function policy(over: Partial<ProviderFlowDto["policy"]> = {}): ProviderFlowDto["policy"] {
  return {
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
    ...over,
  } as ProviderFlowDto["policy"];
}

function setup(over: Partial<ProviderFlowDto["policy"]> = {}) {
  const onClose = vi.fn();
  const refresh = vi.fn(async () => {});
  render(
    <PolicyModal
      policy={policy(over)}
      onClose={onClose}
      refresh={refresh}
      t={(k) => k}
      locale="es"
    />,
  );
  return { onClose, refresh };
}

/** El botón real "Aplicar" que pinta `FilterModal` en su footer. Con `t = (k) => k`, su nombre
 * accesible es la propia clave — así el test NO obliga al componente a cargar un botón extra. */
function save() {
  return screen.getByRole("button", { name: "admin.orchestration.modal.save" });
}

/** Cambia el modo de ejecución usando el select nativo que expone el trigger. */
function chooseMode(mode: string) {
  fireEvent.click(screen.getByTestId("policy-mode"));
  fireEvent.click(screen.getByRole("option", { name: `admin.orchestration.mode.${mode}` }));
}

beforeEach(() => {
  api.updatePolicy.mockReset();
  api.updatePolicy.mockResolvedValue({});
});

describe("PolicyModal — los TRES modos de ejecución", () => {
  it("hides the cron field in `manual` — the clock does not fire that flow", () => {
    setup({ execution_mode: "manual" });
    expect(screen.queryByTestId("policy-cron")).not.toBeInTheDocument();
  });

  it("hides the cron field in `automatic_chain` — the ORDER comes from dependency, not the clock", () => {
    // Ofrecer un cron acá sería una UI que promete algo que el pipeline IGNORA: en cadena
    // declarativa el asset lo arrastra su `AutomationCondition`, no un reloj.
    setup({ execution_mode: "automatic_chain" });
    expect(screen.queryByTestId("policy-cron")).not.toBeInTheDocument();
  });

  it("shows the cron field only in `cron`", () => {
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });
    expect(screen.getByTestId("policy-cron")).toHaveValue("0 6 * * *");
  });

  it("reveals the cron field when the operator switches to `cron`", () => {
    setup({ execution_mode: "manual" });
    expect(screen.queryByTestId("policy-cron")).not.toBeInTheDocument();

    chooseMode("cron");

    expect(screen.getByTestId("policy-cron")).toBeInTheDocument();
  });
});

describe("PolicyModal — campos que el flujo elegido NO lee", () => {
  // El tope de queries lo consume SOLO el descubrimiento (`query_catalog_prices` →
  // `resolve_query_limit`). El refresco pide por id lo ya conocido y el browse recorre secciones:
  // ninguno tiene queries que topar. Ofrecer el control ahí guarda un número que nadie lee.
  it("shows the query limit only for the discovery flow", () => {
    setup({ flow_key: "provider_prices_refresh" });
    expect(screen.getByTestId("policy-query-limit")).toBeInTheDocument();
  });

  it.each(["provider_price_refresh", "provider_browse"])(
    "hides the query limit for %s — nothing reads it there",
    (flow_key) => {
      setup({ flow_key });
      expect(screen.queryByTestId("policy-query-limit")).not.toBeInTheDocument();
    },
  );

  it("does NOT send the query limit when the field is hidden", async () => {
    // Ausente ≠ null: el PATCH usa `exclude_unset=True`, así que la clave ausente es "no lo toques".
    // Mandarla en `null` BORRARÍA un override que el operador no puede ni ver para reponerlo.
    setup({ flow_key: "provider_price_refresh", query_limit_override: 10 });

    fireEvent.click(save());

    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    expect(api.updatePolicy.mock.calls[0][1]).not.toHaveProperty("query_limit_override");
  });

  // La zona horaria SOLO se consume junto al cron: `policy_schedule` corta antes si el modo no es
  // cron, y `next_run_at` devuelve None igual. Se ocultaba el cron pero se dejaba su timezone.
  it("hides the timezone when the clock does not fire the flow", () => {
    setup({ execution_mode: "manual" });
    expect(screen.queryByTestId("policy-timezone")).not.toBeInTheDocument();
  });

  it("shows the timezone alongside the cron", () => {
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });
    expect(screen.getByTestId("policy-timezone")).toBeInTheDocument();
  });

  it("does NOT send the timezone when the field is hidden", async () => {
    setup({ execution_mode: "manual" });

    fireEvent.click(save());

    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    expect(api.updatePolicy.mock.calls[0][1]).not.toHaveProperty("timezone");
  });
});

describe("PolicyModal — alcance de la política (US-OR-L5)", () => {
  it("declara qué NO se configura desde acá", () => {
    // Sin esto el operador no puede distinguir "esta palanca no existe" de "existe pero vive en el
    // despliegue", y busca en la consola algo que nunca va a encontrar.
    setup();
    expect(screen.getByTestId("policy-env-scope")).toBeInTheDocument();
  });
});

describe("PolicyModal — guardado", () => {
  it("sends the edited policy to the endpoint that already existed", async () => {
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });

    fireEvent.change(screen.getByTestId("policy-cron"), { target: { value: "0 4 * * *" } });
    fireEvent.change(screen.getByTestId("policy-sla"), { target: { value: "120" } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.updatePolicy).toHaveBeenCalledWith(
        "pol-1",
        expect.objectContaining({
          execution_mode: "cron",
          cron_expression: "0 4 * * *",
          sla_minutes: 120,
        }),
      ),
    );
  });

  it("does NOT send a cron expression when the mode is not cron", async () => {
    // La validación real vive en la ENTIDAD del backend ("sólo el modo cron admite cron_expression").
    // El form no debe pelearse con ella: si el modo no es cron, el campo no viaja.
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });

    chooseMode("manual");
    fireEvent.click(save());

    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    const [, body] = api.updatePolicy.mock.calls[0];
    expect(body.execution_mode).toBe("manual");
    expect(body.cron_expression).toBeNull();
  });

  it("blocks saving a `cron` policy with an empty expression", async () => {
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });

    fireEvent.change(screen.getByTestId("policy-cron"), { target: { value: "  " } });
    fireEvent.click(save());

    expect(api.updatePolicy).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("NEVER sends `priority` — the DTO does not expose it, so any value it sent would be a wipe", async () => {
    // `PolicyDto` (lectura) no trae `priority`: el form lo leía con un cast y SIEMPRE obtenía
    // `undefined` → el input nacía vacío → `toNullableInt("")` → `null` → cada guardado BORRABA la
    // prioridad de la policy, con la UI mostrando el vacío como si fuera el estado real.
    //
    // El PATCH usa `model_dump(exclude_unset=True)`: un campo AUSENTE no se toca. Por eso la regla es
    // que la clave no viaje, no que viaje con el valor viejo.
    //
    // No se re-expone el campo a propósito: nada en el dominio LEE `priority` (solo se persiste), y
    // el §14 #17 ya dictaminó que el orden real necesita `depends_on_flow` porque `priority` no
    // alcanza. Un control que guarda un número que nadie lee es una promesa falsa al operador.
    setup({ execution_mode: "cron", cron_expression: "0 6 * * *" });

    fireEvent.click(save());

    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    expect(api.updatePolicy.mock.calls[0][1]).not.toHaveProperty("priority");
    expect(screen.queryByTestId("policy-priority")).not.toBeInTheDocument();
  });

  it("sends null (not 0) when a numeric override is cleared", async () => {
    // `0` y "sin override" NO son lo mismo: 0 sería un límite de cero queries. Vaciar el campo debe
    // devolver la precedencia al default global, no fijar un cero.
    setup({ query_limit_override: 10 });

    fireEvent.change(screen.getByTestId("policy-query-limit"), { target: { value: "" } });
    fireEvent.click(save());

    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    expect(api.updatePolicy.mock.calls[0][1].query_limit_override).toBeNull();
  });

  it("no deja el botón colgado si la petición RECHAZA", async () => {
    api.updatePolicy.mockRejectedValue(new Error("se cayó la red"));
    setup({ execution_mode: "manual" });

    fireEvent.click(save());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
  });
});
