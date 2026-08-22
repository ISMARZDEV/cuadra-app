import { describe, expect, test } from "vitest";

import { resolveProductState, type DetailQueryState } from "./product-state";

const idle = (over: Partial<DetailQueryState> = {}): DetailQueryState => ({
  isLoading: false,
  isError: false,
  status: undefined,
  hasData: false,
  ...over,
});

describe("resolveProductState", () => {
  test("mientras la comparación viaja, carga", () => {
    expect(resolveProductState(idle({ isLoading: true }))).toBe("loading");
  });

  test("con datos, contenido — aunque las secciones de abajo hayan fallado", () => {
    // La comparación es la ESPINA de la pantalla; historial, similares y marca son secciones que
    // se pintan solas y fallan solas. Que se caiga el chart no puede tumbar el precio.
    expect(resolveProductState(idle({ hasData: true }))).toBe("content");
  });

  test("un 404 NO es un error de red: el producto no existe", () => {
    // La diferencia importa porque las salidas son distintas: de un fallo de red se REINTENTA, de
    // un producto inexistente se vuelve atrás. Un solo estado obligaría a ofrecer «reintentar»
    // para algo que no va a aparecer por mucho que se insista.
    expect(resolveProductState(idle({ isError: true, status: 404 }))).toBe("notFound");
  });

  test("cualquier otro fallo sí es error reintentable", () => {
    expect(resolveProductState(idle({ isError: true, status: 500 }))).toBe("error");
    expect(resolveProductState(idle({ isError: true }))).toBe("error");
  });

  test("respondió bien y no hay nada que comparar → vacío, no error", () => {
    // Un canónico sin tiendas es un estado LEGÍTIMO del catálogo (recién creado, o todas las
    // tiendas lo dejaron de vender). Decir «algo falló» sería mentir sobre lo que sabemos.
    expect(resolveProductState(idle())).toBe("empty");
  });

  test("cargar gana a un error viejo mientras se reintenta", () => {
    // TanStack conserva `isError` durante el refetch. Sin esta precedencia, tocar «reintentar»
    // dejaría la pantalla de error quieta y parecería que el botón no hace nada.
    expect(resolveProductState(idle({ isLoading: true, isError: true }))).toBe("loading");
  });
});
