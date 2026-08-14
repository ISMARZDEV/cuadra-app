import { describe, expect, test } from "vitest";

import { resolveHomeState, type RailQueryState } from "./home-state";

const idle = (over: Partial<RailQueryState> = {}): RailQueryState => ({
  isLoading: false,
  isError: false,
  count: 0,
  ...over,
});

describe("resolveHomeState", () => {
  test("mientras carga, carga", () => {
    expect(resolveHomeState(idle({ isLoading: true }), idle({ isLoading: true }))).toBe("loading");
  });

  test("las dos fallaron → error, no una pantalla en blanco", () => {
    // Este es el defecto que nos costó tiempo real: sin esto, un error de red se veía EXACTAMENTE
    // igual que «no hay productos» — pantalla vacía y a adivinar.
    expect(resolveHomeState(idle({ isError: true }), idle({ isError: true }))).toBe("error");
  });

  test("si una falla pero la otra trajo datos, se muestra lo que hay", () => {
    // Media pantalla útil es mejor que una disculpa: el rail que falló simplemente no se dibuja.
    expect(resolveHomeState(idle({ isError: true }), idle({ count: 12 }))).toBe("content");
  });

  test("una falló y la otra vino vacía → error, porque NO se puede afirmar que esté vacío", () => {
    // El caso que destapó la mutación. Con una consulta caída no sabemos si hay productos: decir
    // «no hay» sería mentir. Sólo se afirma vacío cuando se pudo mirar el catálogo ENTERO.
    // Verificado por mutación: con `&&` en vez de `||`, esto devuelve "empty" y el test cae.
    expect(resolveHomeState(idle({ isError: true }), idle({ count: 0 }))).toBe("error");
  });

  test("respondieron bien pero sin productos → vacío, NO error", () => {
    // Un catálogo sin ofertas hoy es legítimo. Decir «algo salió mal» ahí sería mentir.
    expect(resolveHomeState(idle(), idle())).toBe("empty");
  });

  test("con datos gana el contenido aunque algo siga cargando", () => {
    // Refetch en segundo plano: ya hay tarjetas en pantalla y taparlas con un spinner sería un
    // parpadeo gratuito.
    expect(resolveHomeState(idle({ count: 6 }), idle({ isLoading: true }))).toBe("content");
  });

  test("una sola con datos alcanza para mostrar contenido", () => {
    expect(resolveHomeState(idle({ count: 6 }), idle())).toBe("content");
  });
});
