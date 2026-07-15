import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReasonCodeSelect } from "./ReasonCodeSelect";

describe("ReasonCodeSelect", () => {
  it("bloquea el submit de RECHAZO si no se eligió un motivo", () => {
    const onReject = vi.fn();
    render(<ReasonCodeSelect onReject={onReject} />);

    fireEvent.click(screen.getByTestId("reject-submit"));

    expect(onReject).not.toHaveBeenCalled();
    expect(screen.getByTestId("reason-code-error")).toBeInTheDocument();
  });

  it("permite el submit de RECHAZO cuando SÍ hay un motivo elegido", () => {
    const onReject = vi.fn();
    render(<ReasonCodeSelect onReject={onReject} />);

    fireEvent.change(screen.getByTestId("reason-code-select"), {
      target: { value: "different_size" },
    });
    fireEvent.click(screen.getByTestId("reject-submit"));

    expect(onReject).toHaveBeenCalledWith({ reasonCode: "different_size", reasonNote: "" });
    expect(screen.queryByTestId("reason-code-error")).not.toBeInTheDocument();
  });
});
