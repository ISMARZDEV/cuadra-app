import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RejectPanel } from "./RejectPanel";

describe("RejectPanel", () => {
  it("bloquea el rechazo si no se eligió motivo, y muestra el error", () => {
    const onReject = vi.fn();
    render(<RejectPanel onReject={onReject} />);

    fireEvent.click(screen.getByTestId("reject-submit"));

    expect(onReject).not.toHaveBeenCalled();
    expect(screen.getByTestId("reason-code-error")).toBeInTheDocument();
  });

  it("con motivo elegido → propaga reasonCode y reasonNote", () => {
    const onReject = vi.fn();
    render(<RejectPanel onReject={onReject} />);

    fireEvent.change(screen.getByTestId("reason-code-select"), {
      target: { value: "different_brand" },
    });
    fireEvent.change(screen.getByTestId("reason-note-input"), {
      target: { value: "marca no coincide" },
    });
    fireEvent.click(screen.getByTestId("reject-submit"));

    expect(onReject).toHaveBeenCalledWith({
      reasonCode: "different_brand",
      reasonNote: "marca no coincide",
    });
  });

  it("el contador de caracteres refleja la longitud de la nota (N / 500)", () => {
    render(<RejectPanel onReject={vi.fn()} />);
    expect(screen.getByText("0 / 500")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("reason-note-input"), { target: { value: "hola!" } });
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("el select de motivo conserva id='reason-code-select' (lo enfoca el atajo 'r')", () => {
    render(<RejectPanel onReject={vi.fn()} />);
    expect(document.getElementById("reason-code-select")).not.toBeNull();
  });
});
