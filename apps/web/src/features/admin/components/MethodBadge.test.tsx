import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MethodBadge } from "./MethodBadge";

describe("MethodBadge", () => {
  it("renderiza el nombre técnico corto del método (Figma tabla: LLM/Human/…, NO localizado)", () => {
    render(<MethodBadge method="llm" />);
    expect(screen.getByText("LLM")).toBeInTheDocument();

    render(<MethodBadge method="human" />);
    expect(screen.getByText("Human")).toBeInTheDocument();
  });

  it("cada método tiene un color pastel DISTINTO (aproximación, refinable en Batch 6)", () => {
    const methods: Array<"ean" | "trgm" | "vector" | "hybrid" | "llm" | "human"> = [
      "ean",
      "trgm",
      "vector",
      "hybrid",
      "llm",
      "human",
    ];
    const classNames = new Set<string>();

    for (const method of methods) {
      const { container, unmount } = render(<MethodBadge method={method} />);
      const badge = container.querySelector("span");
      expect(badge).not.toBeNull();
      classNames.add(badge!.className);
      unmount();
    }

    expect(classNames.size).toBe(methods.length);
  });

  it("método desconocido → no revienta, cae a un estilo neutro con el string crudo", () => {
    render(<MethodBadge method="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});
