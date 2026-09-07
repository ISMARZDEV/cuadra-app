import { describe, expect, test } from "vitest";

import { LENS_TIMING, lensUniforms } from "./model";

// Los ocho invariantes numéricos del patrón autónomo, traídos a vitest: allí viven como
// `tests/model.test.mjs` sobre `node:test`, y este repo no corre esa suite (la puerta del móvil es
// `pnpm test` + `typecheck`). Un test que no corre en CI ni en local no protege nada.
//
// Se afirma la FORMA y las RELACIONES, no milisegundos concretos: las duraciones son una elección
// de traducción, no una medida. Ver `cuadra-motion`, «Testear movimiento».
const W = 390;
const H = 844;

describe("lensUniforms", () => {
  test("un viewport no finito o no positivo es un error, no un valor raro", () => {
    for (const [w, h] of [[0, H], [W, 0], [Number.NaN, H], [W, Number.POSITIVE_INFINITY], [-W, H]]) {
      expect(() => lensUniforms(w, h, 1, 0, false)).toThrow(RangeError);
    }
  });

  test("en reposo la lente no desplaza, no difumina y no vela", () => {
    const u = lensUniforms(W, H, 0, 0, false);
    expect(u.bow).toBe(0);
    expect(u.displacement).toBe(0);
    expect(u.blurRadius).toBe(0);
    expect(u.veil).toBe(0);
  });

  test("«reducir movimiento» equivale al reposo, sea cual sea el progreso", () => {
    expect(lensUniforms(W, H, 1, 1, true)).toEqual(lensUniforms(W, H, 0, 0, false));
  });

  test("el progreso se acota: la intensidad a 1, la geometría a 1.15 — nunca libre", () => {
    // Por debajo de 0 no hay nada que interpretar: reposo.
    expect(lensUniforms(W, H, -5, 0, false)).toEqual(lensUniforms(W, H, 0, 0, false));

    // Por arriba, la INTENSIDAD se queda en su tope…
    const desbocado = lensUniforms(W, H, 5, 0, false);
    const pleno = lensUniforms(W, H, 1, 0, false);
    expect(desbocado.veil).toBe(pleno.veil);
    expect(desbocado.strength).toBe(pleno.strength);
    expect(desbocado.blurRadius).toBe(pleno.blurRadius);

    // …y la GEOMETRÍA se pasa, pero con techo. El muelle de la entrada sobrepasa ~3.5 %, así que
    // 1.15 le sobra; lo que este tope impide es que un muelle mal configurado —o un valor absurdo
    // llegando del hilo de UI— mande la cúpula fuera del universo.
    expect(desbocado.boundary).toBe(lensUniforms(W, H, 1.15, 0, false).boundary);
    expect(desbocado.veilStart).toBe(lensUniforms(W, H, 1.15, 0, false).veilStart);
  });

  test("un progreso no finito degrada a reposo, no a NaN", () => {
    expect(lensUniforms(W, H, Number.NaN, 0, false)).toEqual(lensUniforms(W, H, 0, 0, false));
  });

  test("la frontera SUBE con el progreso: entra desde debajo del viewport", () => {
    const rest = lensUniforms(W, H, 0, 0, false).boundary;
    const full = lensUniforms(W, H, 1, 0, false).boundary;
    expect(rest).toBeGreaterThan(H); // fuera de pantalla, por debajo
    expect(full).toBeLessThan(rest);
    expect(full / H).toBeCloseTo(0.59, 2); // la región baja-media que documenta el patrón
  });

  test("el pulso modula el desplazamiento un 20% COMO MUCHO, y sólo el desplazamiento", () => {
    const sin = lensUniforms(W, H, 1, 0, false);
    const con = lensUniforms(W, H, 1, 1, false);
    expect(con.displacement / sin.displacement).toBeCloseTo(1.2, 6);
    // Todo lo demás es idéntico: el pulso no puede colarse en la curvatura ni en el velo.
    expect(con.bow).toBe(sin.bow);
    expect(con.blurRadius).toBe(sin.blurRadius);
    expect(con.veil).toBe(sin.veil);
  });

  test("un pulso fuera de rango o no finito no amplifica nada", () => {
    const tope = lensUniforms(W, H, 1, 1, false).displacement;
    expect(lensUniforms(W, H, 1, 9, false).displacement).toBe(tope);
    expect(lensUniforms(W, H, 1, Number.NaN, false).displacement).toBe(
      lensUniforms(W, H, 1, 0, false).displacement,
    );
  });

  test("la geometría es PROPORCIONAL al viewport, no píxeles del mock", () => {
    const a = lensUniforms(W, H, 1, 0, false);
    const b = lensUniforms(W * 2, H * 2, 1, 0, false);
    expect(b.bow / a.bow).toBeCloseTo(2, 6);
    expect(b.displacement / a.displacement).toBeCloseTo(2, 6);
    expect(b.feather / a.feather).toBeCloseTo(2, 6);
  });

  test("el velo ARRANCA en el suelo y sube casi al techo — es una rampa que viaja", () => {
    // En reposo empieza en el borde inferior: no hay nada velado.
    expect(lensUniforms(W, H, 0, 0, false).veilStart).toBeCloseTo(H, 5);
    // A pleno, arranca cerca del techo y deja la cabecera fuera.
    const full = lensUniforms(W, H, 1, 0, false).veilStart;
    expect(full / H).toBeCloseTo(0.06, 2);
    // Y es MONÓTONO: nunca baja al avanzar el progreso, o el velo daría un tirón hacia atrás.
    const pasos = [0, 0.25, 0.5, 0.75, 1].map((p) => lensUniforms(W, H, p, 0, false).veilStart);
    for (let i = 1; i < pasos.length; i++) expect(pasos[i]).toBeLessThan(pasos[i - 1]);
  });

  test("el vaivén NO puede moverse en reposo, y `pulse` no lo gobierna", () => {
    // Con progreso 0 la cúpula está guardada: ningún vaivén puede desplazarla.
    const quieto = lensUniforms(W, H, 0, 0, false, 1);
    expect(quieto.boundary).toBe(lensUniforms(W, H, 0, 0, false, -1).boundary);
    // Y `pulse` (la modulación del patrón, 0..1) NO mueve el canto: son entradas distintas.
    expect(lensUniforms(W, H, 1, 1, false).boundary).toBe(lensUniforms(W, H, 1, 0, false).boundary);
    // El vaivén sí lo mueve, y de forma simétrica alrededor del reposo.
    const centro = lensUniforms(W, H, 1, 0, false, 0).boundary;
    const arriba = lensUniforms(W, H, 1, 0, false, -1).boundary;
    const abajo = lensUniforms(W, H, 1, 0, false, 1).boundary;
    expect(centro - arriba).toBeCloseTo(abajo - centro, 5);
  });

  test("el SOBREPASO del muelle mueve la geometría pero NO la intensidad", () => {
    // La subida es un muelle y se pasa de 1. Ese sobrepaso tiene que verse en dónde ESTÁ la
    // cúpula —si no, el muelle acabaría en el mismo sitio que una curva y no habría servido de nada.
    const pleno = lensUniforms(W, H, 1, 0, false);
    const pasado = lensUniforms(W, H, 1.12, 0, false);
    expect(pasado.boundary).toBeLessThan(pleno.boundary); // sube MÁS
    expect(pasado.veilStart).toBeLessThan(pleno.veilStart);

    // Pero el velo, el desenfoque y la fuerza se quedan donde estaban: un velo por encima de 1 no
    // significa nada y un desenfoque de más sólo cuesta fotogramas.
    expect(pasado.veil).toBe(pleno.veil);
    expect(pasado.blurRadius).toBe(pleno.blurRadius);
    expect(pasado.strength).toBe(pleno.strength);
  });

  test("las capas LLEGAN ESCALONADAS: primero el pliegue, luego el blanco, al final el esmerilado", () => {
    // A un tercio del reloj el pliegue ya empuja, el blanco apenas asoma y el desenfoque NO existe.
    // Sin esta escalera los tres aparecen a la vez y el efecto se lee como un interruptor.
    const pronto = lensUniforms(W, H, 1, 0, false, 0, 0.2);
    expect(pronto.displacement).toBeGreaterThan(0);
    expect(pronto.veil).toBeGreaterThan(0);
    expect(pronto.blurRadius).toBe(0);

    // Y al principio del todo, SÓLO el pliegue.
    const arranque = lensUniforms(W, H, 1, 0, false, 0, 0.05);
    expect(arranque.displacement).toBeGreaterThan(0);
    expect(arranque.veil).toBe(0);
    expect(arranque.blurRadius).toBe(0);

    // Con el reloj al final, las tres han llegado enteras.
    const pleno = lensUniforms(W, H, 1, 0, false, 0, 1);
    expect(pleno.veil).toBeCloseTo(1, 5);
    expect(pleno.blurRadius).toBeGreaterThan(0);
  });

  test("el reloj de la coreografía en 0 no dibuja NADA, aunque el progreso esté a tope", () => {
    // Los dos relojes son independientes: si la fase no ha empezado, no puede haber capas puestas
    // por mucho que la cúpula ya esté arriba.
    const u = lensUniforms(W, H, 1, 0, false, 0, 0);
    expect(u.displacement).toBe(0);
    expect(u.veil).toBe(0);
    expect(u.blurRadius).toBe(0);
    expect(u.chroma).toBe(0);
  });

  test("la retirada dura MÁS que la entrada — devolver contexto no es responder a un botón", () => {
    expect(LENS_TIMING.withdrawMs).toBeGreaterThan(LENS_TIMING.enterMs);
    expect(LENS_TIMING.dimMs).toBeLessThan(LENS_TIMING.enterMs);
  });
});
