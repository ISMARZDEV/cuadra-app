import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminDateTime } from "./AdminDateTime";

describe("AdminDateTime", () => {
  it("stacks the time UNDER the date, like the review queue's match column", () => {
    render(<AdminDateTime iso="2026-07-19T16:54:54Z" locale="es" />);

    expect(screen.getByText(/Dom 19, Julio 2026/)).toBeInTheDocument();
    expect(screen.getByText(/4:54/)).toBeInTheDocument();
  });

  it("renders ONE dash when there is no date, not two stacked", () => {
    // Dos guiones apilados se leen como si faltaran dos datos en vez de uno.
    const { container } = render(<AdminDateTime iso={null} locale="es" />);

    expect(container.textContent).toBe("—");
  });
});
