import type { AdminReviewCandidateDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CandidateCard } from "./CandidateCard";

const candidate: AdminReviewCandidateDto = {
  canonical_product_id: "c1",
  name: "Arroz Extra Largo Campos",
  brand: "Campos",
  score: 0.76,
  image_url: "https://example.com/campos.png",
  size_text: null,
};

const store = { name: "Arroz Goya Canilla Extra Largo 10 Lb", brand: "GOYA", sizeText: "10 Lb" };

describe("CandidateCard", () => {
  it("muestra nombre, marca y score en porcentaje", () => {
    render(<CandidateCard candidate={candidate} store={store} rank={1} onApprove={vi.fn()} />);
    expect(screen.getByText("Arroz Extra Largo Campos")).toBeInTheDocument();
    expect(screen.getByText("Campos")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
  });

  it("rank 1 → badge 'Mejor candidato'; rank 2 → sin badge", () => {
    const { rerender } = render(
      <CandidateCard candidate={candidate} store={store} rank={1} onApprove={vi.fn()} />,
    );
    expect(screen.getByText(/mejor candidato/i)).toBeInTheDocument();

    rerender(<CandidateCard candidate={candidate} store={store} rank={2} onApprove={vi.fn()} />);
    expect(screen.queryByText(/mejor candidato/i)).not.toBeInTheDocument();
  });

  it("compara los 3 campos (Nombre/Marca/Tamaño) — Marca difiere", () => {
    render(<CandidateCard candidate={candidate} store={store} rank={1} onApprove={vi.fn()} />);
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.getByText("Marca")).toBeInTheDocument();
    expect(screen.getByText("Tamaño")).toBeInTheDocument();
    expect(screen.getByText("GOYA ≠ Campos")).toBeInTheDocument();
  });

  it("'Aprobar candidato' llama onApprove con el canonical_product_id", () => {
    const onApprove = vi.fn();
    render(<CandidateCard candidate={candidate} store={store} rank={1} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole("button", { name: /aprobar candidato/i }));
    expect(onApprove).toHaveBeenCalledWith("c1");
  });

  it("disabled → el botón aprobar queda deshabilitado", () => {
    render(
      <CandidateCard candidate={candidate} store={store} rank={1} onApprove={vi.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: /aprobar candidato/i })).toBeDisabled();
  });
});
