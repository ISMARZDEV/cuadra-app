import { describe, expect, it } from "vitest";

import { parseCsv } from "./parse-csv";

// Paso 1 del import (US-CP-L8). Este parser NO valida: la validación es del backend, que además
// es el único que puede detectar duplicados contra el catálogo. Acá sólo texto → filas.

describe("parseCsv", () => {
  it("mapea los encabezados canónicos", () => {
    const { rows } = parseCsv("name,brand,size_amount,size_measure\nArroz,GOYA,5,mass");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Arroz",
      brand: "GOYA",
      size_amount: "5",
      size_measure: "mass",
    });
  });

  it("acepta los encabezados en español del operador", () => {
    // El SDD exige mapeo EXPLÍCITO: si el nombre del CSV y el de la columna divergen en silencio,
    // el operador carga datos que se pierden sin ningún aviso.
    const { rows } = parseCsv("nombre,marca,cantidad,unidad\nArroz,GOYA,5,mass");
    expect(rows[0]).toMatchObject({ name: "Arroz", brand: "GOYA", size_amount: "5" });
  });

  it("respeta las comas dentro de comillas", () => {
    const { rows } = parseCsv('name,brand\n"Arroz, Blanco",GOYA');
    expect(rows[0].name).toBe("Arroz, Blanco");
    expect(rows[0].brand).toBe("GOYA");
  });

  it("soporta punto y coma y tabulador como separador", () => {
    expect(parseCsv("name;brand\nArroz;GOYA").rows[0].brand).toBe("GOYA");
    expect(parseCsv("name\tbrand\nArroz\tGOYA").rows[0].brand).toBe("GOYA");
  });

  it("reporta los encabezados desconocidos en vez de descartarlos callado", () => {
    const { unknownHeaders } = parseCsv("name,precio\nArroz,100");
    expect(unknownHeaders).toEqual(["precio"]);
  });

  it("ignora líneas vacías", () => {
    const { rows } = parseCsv("name\nArroz\n\n\nHabichuela\n");
    expect(rows).toHaveLength(2);
  });

  it("un texto vacío no produce filas", () => {
    expect(parseCsv("   ").rows).toEqual([]);
  });

  it("una fila con menos celdas que encabezados no revienta", () => {
    const { rows } = parseCsv("name,brand,size_amount\nArroz");
    expect(rows[0].name).toBe("Arroz");
    expect(rows[0].brand).toBe("");
  });
});
