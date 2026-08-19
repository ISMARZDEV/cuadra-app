import { describe, expect, test } from "vitest";

import { ROW_HEIGHT, searchRowsSkeletonShapes } from "./search-skeleton-layout";

describe("searchRowsSkeletonShapes", () => {
  test("pinta tres formas por fila: el icono, el título y la bajada", () => {
    const { shapes } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 4 });

    expect(shapes).toHaveLength(12);
  });

  test("el hueco mide lo mismo que las filas que va a sustituir", () => {
    // ESTE es el test que justifica que el módulo exista: si el esqueleto no ocupa el sitio EXACTO,
    // al llegar los datos la lista pega un salto y se lee peor que no haber puesto nada.
    const { height } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 5 });

    expect(height).toBe(ROW_HEIGHT * 5);
  });

  test("cada fila queda debajo de la anterior, sin solaparse", () => {
    const { shapes } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 3 });
    const iconos = shapes.filter((s) => s.width === s.height);

    expect(iconos.map((s) => s.y)).toEqual([
      iconos[0].y,
      iconos[0].y + ROW_HEIGHT,
      iconos[0].y + ROW_HEIGHT * 2,
    ]);
  });

  test("el icono es un círculo", () => {
    const { shapes } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 1 });
    const [icono] = shapes;

    expect(icono.width).toBe(icono.height);
    expect(icono.radius).toBe(icono.width / 2);
  });

  // Las barras salen del canto del icono, no del canto de la pantalla: si arrancaran en el margen,
  // el texto fantasma caería DEBAJO del icono y el hueco no se parecería a la fila real.
  test("el texto arranca a la derecha del icono", () => {
    const { shapes } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 1 });
    const [icono, titulo, bajada] = shapes;

    expect(titulo.x).toBeGreaterThan(icono.x + icono.width);
    expect(bajada.x).toBe(titulo.x);
  });

  // La bajada es más corta y más fina que el título: dos barras iguales se leen como una tabla, no
  // como una fila con jerarquía.
  test("la bajada es más corta y más fina que el título", () => {
    const { shapes } = searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 1 });
    const [, titulo, bajada] = shapes;

    expect(bajada.width).toBeLessThan(titulo.width);
    expect(bajada.height).toBeLessThan(titulo.height);
  });

  test("sin filas no hay formas ni alto", () => {
    expect(searchRowsSkeletonShapes({ width: 393, gutter: 16, rows: 0 })).toEqual({
      shapes: [],
      height: 0,
    });
  });
});
