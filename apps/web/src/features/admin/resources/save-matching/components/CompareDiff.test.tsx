import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompareDiff } from "./CompareDiff";

describe("CompareDiff", () => {
  it("resalta un campo que COINCIDE (case/espacio-insensible) como match", () => {
    render(
      <CompareDiff
        storeProduct={{ name: "Arroz La Garza", brand: "La Garza", sizeText: "5 lb" }}
        candidate={{ name: "arroz la garza ", brand: "La Garza", sizeText: "5 lb" }}
      />,
    );
    expect(screen.getByTestId("diff-name")).toHaveAttribute("data-diff", "match");
  });

  it("resalta un campo que DIFIERE", () => {
    render(
      <CompareDiff
        storeProduct={{ name: "Arroz La Garza", brand: "La Garza", sizeText: "5 lb" }}
        candidate={{ name: "Arroz La Garza", brand: "Diferente", sizeText: "10 lb" }}
      />,
    );
    expect(screen.getByTestId("diff-brand")).toHaveAttribute("data-diff", "differ");
    expect(screen.getByTestId("diff-size")).toHaveAttribute("data-diff", "differ");
  });

  it("nunca renderiza lado-a-lado SIN resaltado (cada campo trae data-diff)", () => {
    render(
      <CompareDiff
        storeProduct={{ name: "X", brand: null, sizeText: null }}
        candidate={{ name: "X", brand: null, sizeText: null }}
      />,
    );
    for (const testId of ["diff-name", "diff-brand", "diff-size"]) {
      expect(screen.getByTestId(testId)).toHaveAttribute("data-diff");
    }
  });
});
