import { describe, expect, test } from "vitest";

import {
  BAR_DOWN_AT,
  BAR_LANDS_AT,
  HEADER_AWAY_AT,
  HEADER_BACK_AT,
  HEADER_BACK_MS,
  POP_BACK_AT,
  STAGE,
} from "./search-choreography";

// EL CIERRE SE LEÍA COMO DOS SUCESOS, y esto lo fija.
//
// Al pulsar la X, el header verde y su ruleta colgaban de `onClosed` — el aviso que la hoja manda
// cuando la barra YA ATERRIZÓ. O sea: la barra bajaba sola, la pantalla se quedaba 760ms sin
// header, y sólo entonces bajaba el verde y rebotaban las categorías, terminando pasados 1,8s.
//
// Lo que aquí se afirma no son «los números buenos» —eso es gusto y se ajusta mirando— sino las
// RELACIONES que hacen que el cierre se lea como un solo movimiento. Un ajuste futuro puede mover
// cualquier duración; lo que no puede es volver a separar estas tres cosas.

describe("la coreografía del cierre del buscador", () => {
  test("el header baja CON la barra: arrancan juntos y aterrizan juntos", () => {
    // «Junto con el input, empujado por él». Si arranca después, se ve bajar la barra sola.
    expect(HEADER_BACK_AT).toBe(BAR_DOWN_AT);
    expect(HEADER_BACK_AT + HEADER_BACK_MS).toBe(BAR_LANDS_AT);
  });

  test("las categorías rebotan MIENTRAS la elipse baja, no después", () => {
    // Antes de que la elipse se mueva, rebotarían en el aire; después de que aterrice, se leen
    // como una tercera animación que nadie pidió. Su sitio es en pleno vuelo.
    expect(POP_BACK_AT).toBeGreaterThan(BAR_DOWN_AT);
    expect(POP_BACK_AT).toBeLessThan(BAR_LANDS_AT);
  });

  test("nada de la vuelta espera al aterrizaje de la barra", () => {
    // ÉSTE es el defecto que se corrigió: todo colgaba de `onClosed`, o sea de `BAR_LANDS_AT`.
    expect(HEADER_BACK_AT).toBeLessThan(BAR_LANDS_AT);
    expect(POP_BACK_AT).toBeLessThan(BAR_LANDS_AT);
  });

  test("al ABRIR el orden es el inverso: el header se aparta antes de que suba la barra", () => {
    // La otra mitad de la simetría. Si esto se rompe, la barra sube sobre un header todavía puesto
    // y las dos cosas pelean por el mismo sitio.
    expect(STAGE).toBeGreaterThan(HEADER_AWAY_AT);
  });
});
