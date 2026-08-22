import { describe, expect, test } from "vitest";

import { freshnessOf, priceParts, rowTintClass, storeStandings } from "./product-view";
import type { StoreRow } from "./product-view";

const row = (over: Partial<StoreRow> = {}): StoreRow => ({
  provider_id: "p1",
  provider_name: "Sirena",
  price_minor: 16900,
  currency: "DOP",
  ...over,
});

describe("priceParts", () => {
  test("parte el precio en entero y céntimos para el volado del diseño", () => {
    expect(priceParts(16900, "DOP")).toEqual({ whole: "$169", cents: "00" });
  });

  test("respeta el exponente de la moneda: el yen no tiene céntimos", () => {
    // Inventarle dos decimales al JPY escribiría un precio que no existe.
    expect(priceParts(1690, "JPY")).toEqual({ whole: "$1,690", cents: "" });
  });

  test("mantiene los separadores de millar", () => {
    expect(priceParts(123456, "DOP")).toEqual({ whole: "$1,234", cents: "56" });
  });
});

describe("storeStandings", () => {
  test("la más barata primero, con su sobreprecio", () => {
    const filas = storeStandings([row({ price_minor: 17900 }), row({ price_minor: 16900 })]);

    expect(filas.map((f) => f.price_minor)).toEqual([16900, 17900]);
    expect(filas.map((f) => f.extraMinor)).toEqual([0, 1000]);
  });

  test("marca la más barata y la más cara", () => {
    const [barata, media, cara] = storeStandings([
      row({ price_minor: 16900 }),
      row({ price_minor: 17500 }),
      row({ price_minor: 17900 }),
    ]);

    expect(barata.standing).toBe("cheapest");
    expect(media.standing).toBe("middle");
    expect(cara.standing).toBe("priciest");
  });

  test("con todas empatadas nadie es «la más cara»", () => {
    // Marcar a una sería un desempate INVENTADO, y encima acusaría de cara a quien no lo es.
    const filas = storeStandings([row({ price_minor: 16900 }), row({ price_minor: 16900 })]);

    expect(filas.every((f) => f.standing === "cheapest")).toBe(true);
  });

  test("una sola tienda no es la más barata de nada", () => {
    // «Mejor precio» sin nada contra qué compararlo es una medalla vacía: hay UNA opción.
    expect(storeStandings([row()])[0].standing).toBe("only");
  });

  test("sin tiendas no revienta", () => {
    expect(storeStandings([])).toEqual([]);
  });
});

describe("freshnessOf", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  test("menos de una hora se cuenta en minutos", () => {
    expect(freshnessOf("2026-08-19T11:30:00Z", now)).toEqual({ unit: "minute", value: 30 });
  });

  test("el mismo día, en horas", () => {
    expect(freshnessOf("2026-08-19T09:00:00Z", now)).toEqual({ unit: "hour", value: 3 });
  });

  test("más de un día, en días", () => {
    expect(freshnessOf("2026-08-15T12:00:00Z", now)).toEqual({ unit: "day", value: 4 });
  });

  test("sin fecha no se inventa una", () => {
    // Un precio sin fecha no se puede juzgar. Decir «hace un momento» sería mentir sobre lo único
    // que sostiene la confianza en un comparador de precios.
    expect(freshnessOf(null, now)).toBeNull();
  });

  test("una fecha del futuro se trata como ahora, no como un negativo", () => {
    // Pasa con el desfase de reloj del dispositivo. «hace -3 minutos» delata el bug al usuario.
    expect(freshnessOf("2026-08-19T12:05:00Z", now)).toEqual({ unit: "minute", value: 0 });
  });
});

describe("el tinte de la fila de tienda", () => {
  // Encontrado verificando en el simulador con el tema OSCURO: la fila de la tienda más barata
  // pintaba un `#F1F9EC` clavado mientras su texto sí seguía al tema. Resultado: «Sirena» y
  // «$169.00» en blanco sobre verde muy claro — invisibles. Los 483 tests estaban verdes.
  test("la fila normal no pinta fondo", () => {
    expect(rowTintClass(false)).toBe("");
  });

  test("la fila destacada trae SIEMPRE su pareja en oscuro", () => {
    // ⭐ La regla, y es la general: un tinte clavado sin variante `dark:` es un componente a
    // medias. El texto de la fila sigue al tema; si el fondo no, uno de los dos se come al otro.
    const tint = rowTintClass(true);
    expect(tint).toMatch(/(^|\s)bg-\S+/);
    expect(tint).toMatch(/(^|\s)dark:bg-\S+/);
  });

  test("el claro y el oscuro no son el MISMO color", () => {
    // Repetir el color en la variante `dark:` es la forma de que el test pase sin arreglar nada.
    const tint = rowTintClass(true);
    const light = /(?:^|\s)bg-(\S+)/.exec(tint)?.[1];
    const dark = /(?:^|\s)dark:bg-(\S+)/.exec(tint)?.[1];
    expect(light).toBeDefined();
    expect(dark).not.toBe(light);
  });
});
