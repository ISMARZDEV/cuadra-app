import { describe, expect, test } from "vitest";

import { charDelay, charFade, charProgress } from "./magic-dissolve";

const TOTAL = 20;

describe("la onda sube: el FINAL del texto se deshace primero", () => {
  test("el último carácter arranca antes que el primero", () => {
    // Un texto se lee de arriba abajo, así que sus últimos caracteres son los que están más ABAJO.
    // Si la onda sube, tienen que irse ANTES. Al revés daría una onda descendente.
    expect(charDelay(TOTAL - 1, TOTAL)).toBeLessThan(charDelay(0, TOTAL));
  });

  test("el retardo crece de forma monótona hacia el principio del texto", () => {
    // Con el desorden encima no es estrictamente monótono carácter a carácter, así que se compara
    // por TRAMOS: el frente avanza aunque cada letra tenga su propio capricho.
    const final = charDelay(TOTAL - 1, TOTAL);
    const medio = charDelay(TOTAL / 2, TOTAL);
    const inicio = charDelay(0, TOTAL);
    expect(final).toBeLessThan(medio);
    expect(medio).toBeLessThan(inicio);
  });

  test("nadie se queda sin desaparecer: todos terminan dentro del reloj", () => {
    // ⚠️ Se compara con TOLERANCIA, no con igualdad. El progreso sale de una división y el último
    // carácter cae en 0.9999999999999999 — que en pantalla es opacidad 1e-16, o sea NADA. El
    // invariante que importa es «no queda nada visible», y ése sí se cumple; exigir un 1 exacto
    // sería exigirle a la coma flotante algo que no puede prometer.
    for (let i = 0; i < TOTAL; i++) {
      expect(charProgress(1, i, TOTAL)).toBeCloseTo(1, 10);
    }
  });

  test("con el reloj a cero, el texto está INTACTO", () => {
    for (let i = 0; i < TOTAL; i++) {
      expect(charProgress(0, i, TOTAL)).toBe(0);
    }
  });
});

describe("determinismo", () => {
  test("⭐ el mismo índice da SIEMPRE el mismo retardo", () => {
    // Con `Math.random()` cada render repartiría retardos distintos y el mismo carácter se
    // desharía en otro momento: la magia se vuelve ruido.
    const a = Array.from({ length: TOTAL }, (_, i) => charDelay(i, TOTAL));
    const b = Array.from({ length: TOTAL }, (_, i) => charDelay(i, TOTAL));
    expect(a).toEqual(b);
  });

  test("el desorden EXISTE: no todos los caracteres van en fila perfecta", () => {
    // Sin jitter la onda se lee como una persiana bajando, no como algo que se deshace.
    const pasos = Array.from({ length: TOTAL }, (_, i) => charDelay(i, TOTAL));
    const diffs = pasos.slice(1).map((v, i) => Math.abs(v - pasos[i]));
    const iguales = diffs.every((d) => Math.abs(d - diffs[0]) < 1e-9);
    expect(iguales).toBe(false);
  });
});

describe("un texto de un solo carácter no revienta", () => {
  test("arranca de inmediato", () => {
    expect(charDelay(0, 1)).toBe(0);
    expect(charProgress(1, 0, 1)).toBe(1);
  });
});

describe("charFade · la letra se apaga AL FINAL, no desde el principio", () => {
  test("se mantiene entera durante la primera mitad del viaje", () => {
    // Lo que se envía tiene que seguir LEYÉNDOSE mientras cruza la pantalla. Con una caída lineal
    // desde el primer instante, a media subida ya estaba al 50 % y no se leía nada.
    expect(charFade(0)).toBe(1);
    expect(charFade(0.3)).toBe(1);
    expect(charFade(0.55)).toBe(1);
  });

  test("y se apaga del todo al llegar", () => {
    expect(charFade(1)).toBeCloseTo(0, 6);
    expect(charFade(0.8)).toBeLessThan(1);
    expect(charFade(0.8)).toBeGreaterThan(0);
  });

  test("es monótona: nunca vuelve a encenderse", () => {
    let previo = 1;
    for (let p = 0; p <= 1; p += 0.05) {
      const v = charFade(p);
      expect(v).toBeLessThanOrEqual(previo + 1e-9);
      previo = v;
    }
  });

  test("fuera de rango se acota", () => {
    expect(charFade(-2)).toBe(1);
    expect(charFade(5)).toBeCloseTo(0, 6);
  });
});
