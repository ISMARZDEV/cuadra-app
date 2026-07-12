import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsBanner } from "./ShortcutsBanner";

describe("ShortcutsBanner", () => {
  it("muestra los tres atajos con su tecla y descripción", () => {
    render(<ShortcutsBanner onApprove={vi.fn()} onReject={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText(/aprobar mejor candidato/i)).toBeInTheDocument();
    expect(screen.getByText(/siguiente match/i)).toBeInTheDocument();
  });

  it("cada atajo es un botón clickeable que dispara su acción", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <ShortcutsBanner onApprove={onApprove} onReject={onReject} onNext={onNext} onPrev={onPrev} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /aprobar mejor candidato/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /rechazar match/i }));
    expect(onReject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /match anterior/i }));
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /siguiente match/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disabled → los botones quedan deshabilitados", () => {
    render(
      <ShortcutsBanner onApprove={vi.fn()} onReject={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: /siguiente match/i })).toBeDisabled();
  });
});
