import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailHeader } from "./DetailHeader";

describe("DetailHeader", () => {
  const props = {
    name: "Arroz Goya Canilla Extra Largo 10 Lb",
    confidence: 0.85,
    method: "llm",
    locale: "es" as const,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    queue: { position: 2, total: 117, hasPrev: true, hasNext: true },
  };

  it("muestra el breadcrumb que enlaza a la cola, el título y el subtítulo", () => {
    render(<DetailHeader {...props} />);
    const back = screen.getByRole("link", { name: /volver a cola de revisión/i });
    expect(back).toHaveAttribute("href", "/admin/review-queue");
    expect(screen.getByRole("heading", { name: "Revisar match" })).toBeInTheDocument();
    expect(screen.getByText(/confianza del match:/i)).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
  });

  it("muestra el banner informativo de por qué necesita revisión humana", () => {
    render(<DetailHeader {...props} />);
    expect(screen.getByText(/necesita revisión humana/i)).toBeInTheDocument();
  });

  it("muestra el pager de posición en la cola", () => {
    render(<DetailHeader {...props} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("/ 117")).toBeInTheDocument();
  });
});
