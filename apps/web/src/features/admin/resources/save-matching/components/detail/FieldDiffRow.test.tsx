import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldDiffRow } from "./FieldDiffRow";

describe("FieldDiffRow", () => {
  it("valores iguales (casefold) → badge 'Coincide', sin subtexto", () => {
    render(<FieldDiffRow label="Marca" storeValue="GOYA" candidateValue="Goya" />);
    expect(screen.getByText("Marca")).toBeInTheDocument();
    expect(screen.getByText("Coincide")).toBeInTheDocument();
    expect(screen.queryByText(/≠/)).not.toBeInTheDocument();
  });

  it("valores distintos + showValues → badge 'Diferente' + subtexto 'A ≠ B'", () => {
    render(
      <FieldDiffRow label="Marca" storeValue="GOYA" candidateValue="Campos" showValues />,
    );
    expect(screen.getByText("Diferente")).toBeInTheDocument();
    expect(screen.getByText("GOYA ≠ Campos")).toBeInTheDocument();
  });

  it("candidato ausente → '—' en el subtexto", () => {
    render(<FieldDiffRow label="Tamaño" storeValue="10 Lb" candidateValue={null} showValues />);
    expect(screen.getByText("Diferente")).toBeInTheDocument();
    expect(screen.getByText("10 Lb ≠ —")).toBeInTheDocument();
  });

  it("distintos SIN showValues (nombres largos) → badge sin subtexto", () => {
    render(
      <FieldDiffRow
        label="Nombre"
        storeValue="Arroz Goya Canilla Extra Largo 10 Lb"
        candidateValue="Arroz Extra Largo Campos"
      />,
    );
    expect(screen.getByText("Diferente")).toBeInTheDocument();
    expect(screen.queryByText(/≠/)).not.toBeInTheDocument();
  });
});
