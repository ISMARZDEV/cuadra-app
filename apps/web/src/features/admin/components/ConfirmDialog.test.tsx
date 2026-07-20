import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

// Confirmación fuerte para acciones con impacto operativo (plan maestro §5.3: "la UI explica alcance
// y consecuencias antes de confirmar"). Vive en `admin/components` y NO dentro de un recurso porque
// Orquestación (cancelar corrida, eliminar policy), Canónicos (archivar) y Productos la necesitan
// igual — construirla local sería duplicarla tres veces.
function setup(over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Cancelar la corrida"
      description="La corrida se detiene donde esté. Lo ya ingerido se conserva."
      confirmLabel="Sí, cancelar"
      cancelLabel="Volver"
      onConfirm={onConfirm}
      {...over}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("shows the title and the IMPACT, not just a yes/no", () => {
    setup();
    expect(screen.getByText("Cancelar la corrida")).toBeInTheDocument();
    // Lo que distingue una confirmación fuerte de un `confirm()`: explica qué va a pasar.
    expect(
      screen.getByText("La corrida se detiene donde esté. Lo ya ingerido se conserva."),
    ).toBeInTheDocument();
  });

  it("runs the action only when the user confirms", () => {
    const { onConfirm } = setup();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes WITHOUT running the action when the user backs out", () => {
    const { onConfirm, onOpenChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render anything while closed", () => {
    setup({ open: false });
    expect(screen.queryByText("Cancelar la corrida")).not.toBeInTheDocument();
  });

  it("blocks a second confirm while the action is in flight", () => {
    // Sin esto, dos clics seguidos lanzan la mutación dos veces — sobre "cancelar corrida" o
    // "eliminar" eso es exactamente lo que no puede pasar.
    const { onConfirm } = setup({ busy: true });

    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
