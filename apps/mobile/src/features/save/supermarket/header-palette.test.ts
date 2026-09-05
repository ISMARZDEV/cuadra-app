import { describe, expect, test } from "vitest";

import {
  CONTRAST_FLOOR,
  contrastOf,
  dealNext,
  HEADER_CARDS,
  HEADER_SKIN_GREEN,
  resolveSkin,
  type HeaderCard,
} from "./header-palette";

/** Elige siempre la primera: vuelve determinista lo que en la app es azar. */
const first = () => 0;
/** Elige siempre la última. */
const last = (n: number) => n - 1;

describe("el mazo", () => {
  test("LA GUARDIA: todas las cartas se leen", () => {
    // Éste es el test que de verdad importa, y existe porque una pareja mal elegida NO se nota
    // mirando dos hex en un fichero: se nota cuando el título es ilegible en el teléfono de alguien.
    // La tinta ya no se deriva —la trae la carta— así que sin esto nada impediría que entrara una
    // pareja rota.
    for (const card of HEADER_CARDS) {
      expect(contrastOf(card), `${card.light} con ${card.dark}`).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR,
      );
    }
  });

  test("el verde de siempre también cumple", () => {
    // La home y la rejilla siguen usándolo, así que entra en la misma guardia.
    expect(contrastOf(HEADER_SKIN_GREEN)).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  test("ninguna carta repite color", () => {
    // Dos cartas con el mismo luminoso romperían el «no se repite»: `dealNext` compara por ahí.
    expect(new Set(HEADER_CARDS.map((c) => c.light)).size).toBe(HEADER_CARDS.length);
    // Y si compartieran el profundo habríamos vuelto al negro genérico que esto vino a sustituir.
    expect(new Set(HEADER_CARDS.map((c) => c.dark)).size).toBe(HEADER_CARDS.length);
  });
});

describe("resolveSkin", () => {
  test("en claro manda el luminoso; en oscuro se cambian los papeles", () => {
    const card: HeaderCard = { light: "#FFD4E4", dark: "#760045" };

    expect(resolveSkin(card, false)).toMatchObject({ bg: "#FFD4E4", ink: "#760045" });
    expect(resolveSkin(card, true)).toMatchObject({ bg: "#760045", ink: "#FFD4E4" });
  });

  test("EL DEFECTO: en OSCURO el aro tiene que ser SÓLIDO o desaparece", () => {
    // Medido sobre la carta azul: con vidrio tintado el disco salía en `#29506E` — 1.63:1 contra su
    // cabecera, cuando un control necesita 3.0. El material del vidrio sigue al tema y en oscuro se
    // traga cualquier color claro, así que el tinte no puede levantarlo por más claro que sea.
    const durazno: HeaderCard = { light: "#FFE2C9", dark: "#481C00" };

    expect(resolveSkin(durazno, true).button).toEqual({
      tint: "#FFE2C9",
      icon: "#481C00",
      solid: true,
    });
  });

  test("en CLARO conserva el VIDRIO: ahí el material no estorba", () => {
    const durazno: HeaderCard = { light: "#FFE2C9", dark: "#481C00" };

    expect(resolveSkin(durazno, false).button).toEqual({
      tint: "#481C00",
      icon: "#FFE2C9",
      solid: false,
    });
  });

  test("⭐ el COLOR del aro es el mismo en los dos temas; sólo cambia el material", () => {
    // Es lo que impide que los dos temas se separen: una sola regla de color, una sola diferencia.
    for (const card of HEADER_CARDS) {
      for (const isDark of [false, true]) {
        const skin = resolveSkin(card, isDark);
        expect(skin.button?.tint).toBe(skin.ink);
        expect(skin.button?.icon).toBe(skin.bg);
        expect(skin.button?.solid).toBe(isDark);
      }
    }
  });

  test("el glifo es SIEMPRE el fondo de la cabecera, en los dos temas", () => {
    // Es lo que hace que el botón se lea como un hueco recortado en la cabecera y no como una pieza
    // pegada encima con colores de otra parte.
    for (const card of HEADER_CARDS) {
      expect(resolveSkin(card, false).button?.icon).toBe(card.light);
      expect(resolveSkin(card, true).button?.icon).toBe(card.dark);
    }
  });

  test("la cabecera VERDE no impone colores: conserva el lima de marca", () => {
    // LA REGRESIÓN QUE ESTO EVITA: al mover los colores del botón a la piel, la verde empezó a
    // imponer blanco+verde y la home y la rejilla perdieron sus aros lima sin que nadie lo pidiera.
    expect(HEADER_SKIN_GREEN.button).toBeUndefined();
  });

  test("⭐ voltear la carta NO cambia su contraste, y por eso una comprobación vale para los dos temas", () => {
    // Es la razón de que la paleta sean diez hex y no veinte. Si el contraste no fuera simétrico
    // haría falta una paleta oscura aparte, y dos paletas se desincronizan.
    for (const card of HEADER_CARDS) {
      const claro = contrastOf(resolveSkin(card, false));
      const oscuro = contrastOf(resolveSkin(card, true));
      expect(oscuro, `${card.light}`).toBeCloseTo(claro, 10);
      expect(oscuro).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    }
  });
});

describe("dealNext", () => {
  test("reparte del mazo y lo va vaciando", () => {
    const mazo = [HEADER_CARDS[0], HEADER_CARDS[1]];
    const got = dealNext(mazo, null, first);

    expect(got.card.light).toBe(HEADER_CARDS[0].light);
    expect(got.remaining).toHaveLength(1);
    expect(got.remaining[0].light).toBe(HEADER_CARDS[1].light);
  });

  test("con el mazo vacío se rellena con la baraja ENTERA", () => {
    const got = dealNext([], null, first);

    expect(HEADER_CARDS.map((c) => c.light)).toContain(got.card.light);
    expect(got.remaining).toHaveLength(HEADER_CARDS.length - 1);
  });

  test("EL REQUISITO: nunca sale la misma carta dos veces seguidas", () => {
    // El caso peligroso es el CAMBIO DE CICLO: el mazo se acaba, se rellena entero, y si el azar
    // saca justo la que acabas de ver, dos productos seguidos comparten cabecera. Lo impide el
    // repartidor, no la suerte.
    const got = dealNext([], HEADER_CARDS[0], first);

    expect(got.card.light).not.toBe(HEADER_CARDS[0].light);
  });

  test("compara por FONDO, no por identidad de objeto", () => {
    // EL DEFECTO QUE ESTO EVITA: el mazo se rehidrata desde las constantes, así que la carta que se
    // está viendo puede ser una COPIA con los mismos colores. Con `!==` la exclusión no se aplicaría
    // y el repetido pasaría justo en el cambio de ciclo, que es el único momento en que puede pasar.
    const copia: HeaderCard = { ...HEADER_CARDS[0] };
    const got = dealNext([], copia, first);

    expect(got.card.light).not.toBe(copia.light);
  });

  test("la carta repetida NO se pierde: vuelve más adelante en el mismo ciclo", () => {
    // Excluirla del relleno en vez de sólo de la primera carta la dejaría fuera del ciclo entero, y
    // con el tiempo un color se vería la mitad de veces que los demás sin que nadie sepa por qué.
    const got = dealNext([], HEADER_CARDS[0], first);

    expect(got.remaining.map((c) => c.light)).toContain(HEADER_CARDS[0].light);
  });

  test("se ven las CINCO antes de que se repita ninguna", () => {
    let remaining: HeaderCard[] = [];
    let previo: HeaderCard | null = null;
    const salidas: string[] = [];

    for (let i = 0; i < HEADER_CARDS.length; i += 1) {
      const got = dealNext(remaining, previo, first);
      salidas.push(got.card.light);
      remaining = got.remaining;
      previo = got.card;
    }

    expect(new Set(salidas).size).toBe(HEADER_CARDS.length);
  });

  test("un `pick` fuera de rango no revienta ni devuelve undefined", () => {
    // `Math.random()` puede dar 0.999… y con redondeos raros el índice se sale. Una carta
    // `undefined` pintaría la cabecera transparente y la pantalla se leería rota.
    for (const pick of [() => -1, () => 99, () => 1.7, () => Number.NaN]) {
      const got = dealNext([...HEADER_CARDS], null, pick);
      expect(HEADER_CARDS.map((c) => c.light)).toContain(got.card.light);
    }
  });

  test("con una sola carta la devuelve aunque sea la anterior", () => {
    // No debería ocurrir —la anterior ya salió del mazo— pero devolver `undefined` aquí sería
    // cambiar un defecto visible por una pantalla rota.
    const got = dealNext([HEADER_CARDS[0]], HEADER_CARDS[0], last);

    expect(got.card.light).toBe(HEADER_CARDS[0].light);
  });
});

