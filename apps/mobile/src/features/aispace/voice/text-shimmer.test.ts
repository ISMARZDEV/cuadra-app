import { describe, expect, test } from "vitest";

import { DIM, shimmerGlow, shimmerHead, shimmerOpacity } from "./text-shimmer";

const TOTAL = 30;
const letras = Array.from({ length: TOTAL }, (_, i) => i);
/** El ciclo muestreado finito. Un barrido es continuo; se mira en pasos suficientes para verlo. */
const CICLO = Array.from({ length: 101 }, (_, k) => k / 100);

describe("el barrido del shimmer", () => {
  test("el frente ENTRA y SALE por fuera de la frase", () => {
    // Naciendo en 0 la primera letra ya estaría encendida en el fotograma inicial: el barrido
    // parecería empezar a medias. Tiene que llegar de fuera y marcharse fuera.
    expect(shimmerHead(0)).toBeLessThan(0);
    expect(shimmerHead(1)).toBeGreaterThan(1);
  });

  test("el frente avanza SIEMPRE hacia adelante —nunca retrocede dentro de un barrido—", () => {
    for (let k = 1; k < CICLO.length; k++) {
      expect(shimmerHead(CICLO[k])).toBeGreaterThan(shimmerHead(CICLO[k - 1]));
    }
  });

  /**
   * ⭐⭐ **EL ANÁLOGO DE §7b: que TODAS las letras quepan en el barrido.** Con una banda estrecha o
   * un recorrido corto, las letras de un extremo no llegan nunca a encenderse del todo — y eso no se
   * ve mirando: se lee como que «ahí el shimmer va más flojo». Es un número, no una opinión.
   */
  test("TODA letra alcanza el brillo pleno en algún punto del barrido", () => {
    const apagadas = letras.filter(
      (i) => Math.max(...CICLO.map((c) => shimmerGlow(c, i, TOTAL))) < 0.99,
    );
    expect(apagadas).toEqual([]);
  });

  test("el brillo VIAJA: cada letra se enciende después que la anterior", () => {
    const pico = (i: number) =>
      CICLO.reduce((mejor, c) => (shimmerGlow(c, i, TOTAL) > shimmerGlow(mejor, i, TOTAL) ? c : mejor), 0);
    for (let i = 1; i < TOTAL; i++) expect(pico(i)).toBeGreaterThan(pico(i - 1));
  });

  /**
   * ⚠️ Una RAMPA lineal también sube y baja sin saltos, así que «continua» no distingue nada. Lo que
   * separa una campana de una rampa es que la campana LLEGA PLANA a su pico: la derivada se anula
   * arriba y es máxima en el flanco. Eso es lo que hace que el brillo se pose en vez de doblar en
   * pico, y es lo único que se ve.
   */
  test("la banda es una CAMPANA, no una rampa —llega PLANA a su pico", () => {
    const i = 15;
    const curva = CICLO.map((c) => shimmerGlow(c, i, TOTAL));
    const pico = curva.indexOf(Math.max(...curva));
    const pendiente = (k: number) => Math.abs(curva[k + 1] - curva[k]);
    // En el pico casi no cambia; a media caída, cambia mucho más. Una rampa las tendría iguales.
    expect(pendiente(pico)).toBeLessThan(pendiente(pico + 8) / 3);
  });

  test("la opacidad se queda entre el apagado y el pleno, nunca fuera", () => {
    const fuera = CICLO.flatMap((c) => letras.map((i) => shimmerOpacity(shimmerGlow(c, i, TOTAL))))
      .filter((o) => o < DIM || o > 1);
    expect(fuera).toEqual([]);
  });

  test("el texto NUNCA desaparece: en su punto más apagado sigue siendo legible", () => {
    // El shimmer atenúa, no borra. Lo que borra es el fade final, y ése es otro suceso.
    expect(DIM).toBeGreaterThanOrEqual(0.45);
    expect(shimmerOpacity(0)).toBe(DIM);
    expect(shimmerOpacity(1)).toBe(1);
  });

  test("una sola letra no rompe la aritmética", () => {
    expect(() => CICLO.map((c) => shimmerGlow(c, 0, 1))).not.toThrow();
    // El mismo criterio que el resto: el muestreo es finito, así que el frente pasa CERCA del
    // centro de la letra, no exactamente por él.
    expect(Math.max(...CICLO.map((c) => shimmerGlow(c, 0, 1)))).toBeGreaterThan(0.99);
  });
});
