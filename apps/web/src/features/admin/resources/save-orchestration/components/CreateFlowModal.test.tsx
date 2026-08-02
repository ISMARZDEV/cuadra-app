import type { ProviderDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ createProviderFlow: vi.fn() }));
vi.mock("../api", () => api);

import { CreateFlowModal } from "./CreateFlowModal";

const PROVIDERS: ProviderDto[] = [
  { id: "p-sirena", name: "Sirena", type: "supermarket", platform: "vtex", market_id: "DO" },
  { id: "p-bravo", name: "Bravo", type: "supermarket", platform: "rest_catalog", market_id: "DO" },
];

function setup(existing: { provider_id: string; flow_key: string }[] = []) {
  const onClose = vi.fn();
  const refresh = vi.fn(async () => {});
  render(
    <CreateFlowModal
      providers={PROVIDERS}
      existingFlows={existing}
      onClose={onClose}
      refresh={refresh}
      t={(k) => k}
      locale="es"
    />,
  );
  return { onClose, refresh };
}

function save() {
  return screen.getByRole("button", { name: "admin.orchestration.create.save" });
}

/** `FilterSearchSelect` es un combobox que despliega su listbox al enfocar el input. */
function openProviderList() {
  // Hay DOS combobox desde que el flujo se elige: el de proveedor es el buscable.
  fireEvent.focus(screen.getByRole("combobox", { name: /proveedor|provider/i }));
}

/** El `role="option"` vive en el `<li>`, pero el handler está en el `<button>` de adentro. */
function pickProvider(name: RegExp) {
  fireEvent.click(within(screen.getByRole("option", { name })).getByRole("button"));
}

beforeEach(() => {
  api.createProviderFlow.mockReset();
  api.createProviderFlow.mockResolvedValue({});
});

describe("CreateFlowModal", () => {
  it("only offers providers that do not have a flow yet", () => {
    // La policy es única por (provider, market, flow) — y una PAUSADA sigue ocupando el lugar.
    // Ofrecer un proveedor que ya tiene flujo garantiza un 422; mejor no ofrecerlo.
    setup([{ provider_id: "p-sirena", flow_key: "provider_prices_refresh" }]);

    openProviderList();

    expect(screen.queryByRole("option", { name: /Sirena/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bravo/ })).toBeInTheDocument();
  });

  it("blocks submitting without a provider", async () => {
    setup();
    fireEvent.click(save());

    expect(api.createProviderFlow).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("creates the flow for the chosen provider", async () => {
    setup();

    openProviderList();
    pickProvider(/Bravo/);
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.createProviderFlow).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: "p-bravo", flow_key: "provider_prices_refresh" }),
      ),
    );
  });

  it("sends the CHOSEN flow, not always discovery", async () => {
    // El refresco de precios era global y no se podía crear por tienda: su cupo de 500 se lo
    // llevaba entera la más atrasada.
    setup();

    // El flujo se elige ANTES que el proveedor: la lista de proveedores depende de él.
    fireEvent.change(screen.getByTestId("create-flow"), {
      target: { value: "provider_price_refresh" },
    });
    openProviderList();
    pickProvider(/Bravo/);
    fireEvent.click(save());

    await waitFor(() =>
      expect(api.createProviderFlow).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: "p-bravo", flow_key: "provider_price_refresh" }),
      ),
    );
  });

  it("surfaces the backend's REASON verbatim, not a generic error", async () => {
    // El backend responde 422 con el MOTIVO (`ProviderFlowNotSupported`) justamente para que el
    // operador sepa si la tienda no tiene fuente, está apagada, o su plataforma no sabe hacer lo que
    // el flow pide. Tragarlo y mostrar "algo salió mal" tira a la basura la parte útil.
    api.createProviderFlow.mockResolvedValue({
      error: { detail: "El proveedor Bravo no tiene una fuente habilitada." },
    });
    setup();

    openProviderList();
    pickProvider(/Bravo/);
    fireEvent.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El proveedor Bravo no tiene una fuente habilitada.",
    );
  });

  it("tells the operator when every provider already has a flow", () => {
    setup([
      { provider_id: "p-sirena", flow_key: "provider_prices_refresh" },
      { provider_id: "p-bravo", flow_key: "provider_prices_refresh" },
    ]);
    // Vacío HONESTO: explica por qué no hay nada que elegir, en vez de un select vacío mudo.
    expect(screen.getByTestId("create-no-providers")).toBeInTheDocument();
  });

  // La unicidad es por (proveedor, mercado, FLUJO): un proveedor con descubrimiento puede tener
  // además refresco de precios. Excluirlo del todo dejaba imposible crear el segundo flujo.
  it("still offers a provider for a DIFFERENT flow it does not have yet", async () => {
    setup([{ provider_id: "p-bravo", flow_key: "provider_prices_refresh" }]);

    fireEvent.change(screen.getByTestId("create-flow"), {
      target: { value: "provider_price_refresh" },
    });
    openProviderList();

    expect(screen.getByRole("option", { name: /Bravo/ })).toBeInTheDocument();
  });

  it("hides the provider for the flow it ALREADY has", async () => {
    setup([{ provider_id: "p-bravo", flow_key: "provider_prices_refresh" }]);

    openProviderList();

    expect(screen.queryByRole("option", { name: /Bravo/ })).not.toBeInTheDocument();
  });

  // La lista de proveedores DEPENDE del flujo. Preguntar primero el proveedor dejaba al operador
  // eligiendo de una lista calculada por un campo que todavía no había visto: con los 3 flujos de
  // descubrimiento ya creados, el modal abría sin Bravo/Sirena/Nacional y parecía roto.
  it("asks for the FLOW before the provider", () => {
    setup();

    const flow = screen.getByTestId("create-flow");
    const provider = screen.getByRole("combobox", { name: /proveedor|provider/i });

    expect(flow.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clears the chosen provider when the flow changes", async () => {
    // Sin esto el proveedor elegido sobrevive al cambio de flujo y puede quedar fuera de los
    // disponibles: se enviaría un par (proveedor, flujo) que YA existe y el backend responde 422.
    setup([{ provider_id: "p-bravo", flow_key: "provider_price_refresh" }]);

    openProviderList();
    pickProvider(/Bravo/);
    fireEvent.change(screen.getByTestId("create-flow"), {
      target: { value: "provider_price_refresh" },
    });
    fireEvent.click(save());

    expect(api.createProviderFlow).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  // `provider_prices_refresh` y `provider_price_refresh` se diferencian en UNA `s` y significan
  // cosas opuestas (descubrir vs re-preciar). El nombre solo no alcanza para elegir bien.
  it("explains what the chosen flow actually does", () => {
    setup();

    expect(screen.getByTestId("create-flow-help")).toHaveTextContent(
      "admin.orchestration.create.flowHelp.provider_prices_refresh",
    );

    fireEvent.change(screen.getByTestId("create-flow"), {
      target: { value: "provider_browse" },
    });

    expect(screen.getByTestId("create-flow-help")).toHaveTextContent(
      "admin.orchestration.create.flowHelp.provider_browse",
    );
  });

  it("no deja el botón colgado si la petición RECHAZA", async () => {
    // `setBusy(false)` sólo en el camino feliz deja el flag en `true` cuando la promesa rechaza:
    // el botón queda deshabilitado para siempre y hay que cerrar y reabrir el modal.
    api.createProviderFlow.mockRejectedValue(new Error("se cayó la red"));
    setup();

    fireEvent.change(screen.getByTestId("create-flow"), {
      target: { value: "provider_price_refresh" },
    });
    openProviderList();
    pickProvider(/Bravo/);
    fireEvent.click(save());

    // Vuelve a estar disponible (etiqueta normal, no la de "creando…") y avisa del fallo.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
  });
});
