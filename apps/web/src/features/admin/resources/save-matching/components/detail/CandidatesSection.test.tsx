import type { AdminReviewCandidateDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CandidatesSection } from "./CandidatesSection";

const store = { name: "Arroz Goya", brand: "GOYA", sizeText: "10 Lb" };
const mk = (id: string, score: number): AdminReviewCandidateDto => ({
  canonical_product_id: id,
  name: `Cand ${id}`,
  brand: "X",
  score,
  image_url: null,
  size_text: null,
});

describe("CandidatesSection", () => {
  it("renderiza una card por candidato, con el primero como mejor candidato", () => {
    render(
      <CandidatesSection
        candidates={[mk("a", 0.76), mk("b", 0.73)]}
        store={store}
        onApprove={vi.fn()}
      />,
    );
    expect(screen.getByText("Cand a")).toBeInTheDocument();
    expect(screen.getByText("Cand b")).toBeInTheDocument();
    expect(screen.getByText(/mejor candidato/i)).toBeInTheDocument();
  });

  it("lista vacía → estado 'sin candidatos' (nunca error)", () => {
    render(<CandidatesSection candidates={[]} store={store} onApprove={vi.fn()} />);
    expect(screen.getByTestId("no-candidates")).toBeInTheDocument();
    expect(screen.queryByText(/mejor candidato/i)).not.toBeInTheDocument();
  });
});
