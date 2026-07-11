import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueuePager } from "./QueuePager";

describe("QueuePager", () => {
  it("muestra la posición y el total", () => {
    render(
      <QueuePager position={2} total={117} hasPrev hasNext onPrev={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("/ 117")).toBeInTheDocument();
  });

  it("posición desconocida → '—'", () => {
    render(
      <QueuePager
        position={null}
        total={117}
        hasPrev={false}
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("los botones navegan y se deshabilitan en los extremos", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <QueuePager
        position={1}
        total={117}
        hasPrev={false}
        hasNext
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    // primero de la cola → "anterior" deshabilitado
    expect(screen.getByRole("button", { name: /match anterior/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /siguiente match/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("último de la cola → 'siguiente' deshabilitado", () => {
    render(
      <QueuePager
        position={117}
        total={117}
        hasPrev
        hasNext={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /siguiente match/i })).toBeDisabled();
  });
});
