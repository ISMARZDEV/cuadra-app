import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StreamingText } from "./streaming-text";

describe("StreamingText", () => {
  test("renders every word of the streamed text", () => {
    render(<StreamingText text="Hola, ¿cómo va tu dinero?" />);
    for (const word of ["Hola,", "¿cómo", "va", "tu", "dinero?"]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  test("keeps words across explicit line breaks", () => {
    render(<StreamingText text={"primera\nsegunda"} />);
    expect(screen.getByText("primera")).toBeInTheDocument();
    expect(screen.getByText("segunda")).toBeInTheDocument();
  });

  test("renders nothing to crash on empty text", () => {
    expect(() => render(<StreamingText text="" />)).not.toThrow();
  });
});
