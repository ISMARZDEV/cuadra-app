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

function setup(existing: string[] = []) {
  const onClose = vi.fn();
  const refresh = vi.fn(async () => {});
  render(
    <CreateFlowModal
      providers={PROVIDERS}
      existingProviderIds={existing}
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
  fireEvent.focus(screen.getByRole("combobox"));
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
    setup(["p-sirena"]);

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
    setup(["p-sirena", "p-bravo"]);
    // Vacío HONESTO: explica por qué no hay nada que elegir, en vez de un select vacío mudo.
    expect(screen.getByTestId("create-no-providers")).toBeInTheDocument();
  });
});
