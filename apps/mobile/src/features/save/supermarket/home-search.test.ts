import { describe, expect, test } from "vitest";

import { browseSearchHref } from "./home-search";

describe("browseSearchHref", () => {
  test("lleva lo escrito a la rejilla", () => {
    expect(browseSearchHref("leche")).toBe("/save/supermarket/browse?origin=featured&q=leche");
  });

  test("sin texto, la rejilla se abre sin búsqueda en vez de con una vacía", () => {
    // `?q=` sembraría la rejilla con una cadena vacía, y ahí la pantalla se cree «buscando»: pinta
    // «sin resultados» en lugar del catálogo. Tocar la lupa sin escribir tiene que llevar al súper.
    expect(browseSearchHref("")).toBe("/save/supermarket/browse?origin=featured");
    expect(browseSearchHref("   ")).toBe("/save/supermarket/browse?origin=featured");
  });

  test("recorta los espacios de los extremos", () => {
    // El teclado de iOS mete un espacio al aceptar una sugerencia, así que llegan solos.
    expect(browseSearchHref("  arroz ")).toBe("/save/supermarket/browse?origin=featured&q=arroz");
  });

  test("escapa lo que rompería la URL", () => {
    // Un `&` sin escapar parte la consulta en dos parámetros y la búsqueda llega cortada; un
    // espacio sin escapar deja una URL inválida. Los dos se escriben en un buscador de súper.
    expect(browseSearchHref("café & té")).toBe(
      "/save/supermarket/browse?origin=featured&q=caf%C3%A9%20%26%20t%C3%A9",
    );
  });

  test("colapsa los espacios de dentro", () => {
    // «arroz    selecto» y «arroz selecto» son la misma búsqueda; mandarlas distintas parte la
    // caché de la consulta en dos entradas que traen exactamente lo mismo.
    expect(browseSearchHref("arroz   selecto")).toBe(
      "/save/supermarket/browse?origin=featured&q=arroz%20selecto",
    );
  });
});
