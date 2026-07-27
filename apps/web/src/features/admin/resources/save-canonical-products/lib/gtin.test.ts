import { describe, expect, it } from "vitest";

import { toGtin14 } from "./gtin";

// US-CP-D8: el panel de Evidencia muestra el EAN CRUDO de cada tienda. Sin llevarlo a su forma
// canónica, dos códigos IDÉNTICOS con distinto padding se leen como distintos, y el operador
// concluye que las tiendas no coinciden — el camino directo a crear un duplicado a mano.

describe("toGtin14", () => {
  it("rellena un EAN-13 a 14 dígitos", () => {
    expect(toGtin14("0781086020518")).toBe("00781086020518");
  });

  it("deja intacto uno que ya viene en GTIN-14", () => {
    expect(toGtin14("07810860205186")).toBe("07810860205186");
  });

  it("dos formas del MISMO código terminan iguales", () => {
    // Ésta es la razón de ser de la función.
    expect(toGtin14("781086020518")).toBe(toGtin14("00781086020518"));
  });

  it("un UPC-A de 12 también se normaliza", () => {
    expect(toGtin14("012345678905")).toBe("00012345678905");
  });

  it("vacío o nulo es null, no una cadena de ceros", () => {
    expect(toGtin14(null)).toBeNull();
    expect(toGtin14("")).toBeNull();
    expect(toGtin14("   ")).toBeNull();
  });

  it("algo que no son dígitos se devuelve tal cual en vez de mutilarse", () => {
    // Rellenar con ceros un valor que no es un GTIN inventaría un código que no existe.
    expect(toGtin14("SIN-EAN")).toBe("SIN-EAN");
  });

  it("más de 14 dígitos se deja como está: recortar inventaría otro producto", () => {
    expect(toGtin14("123456789012345")).toBe("123456789012345");
  });
});
