import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";

describe("Table (ui-base)", () => {
  it("renders a header and a row with queryable cell text", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Tienda</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Coca-Cola 2L</TableCell>
            <TableCell>La Sirena</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Producto" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tienda" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Coca-Cola 2L" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "La Sirena" })).toBeInTheDocument();
  });
});
