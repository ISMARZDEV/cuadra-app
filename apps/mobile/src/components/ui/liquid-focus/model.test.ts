import { describe, expect, test } from "vitest";

import { LENS_TIMING, lensUniforms } from "./model";

const W = 390;
const H = 844;

describe("lensUniforms", () => {
  test("rechaza viewports no finitos o no positivos", () => {
    for (const [w, h] of [[0, H], [W, 0], [Number.NaN, H], [W, Infinity], [-W, H]]) {
      expect(() => lensUniforms(w, h, 1, 0, false)).toThrow(RangeError);
    }
  });

  test("en reposo no desplaza, difumina, vela ni ondula", () => {
    const u = lensUniforms(W, H, 0, 0, false, 0.4);
    expect(u.strength).toBe(0);
    expect(u.displacement).toBe(0);
    expect(u.blurRadius).toBe(0);
    expect(u.edgeTilt).toBe(0);
    expect(u.ripple).toBe(0);
  });

  test("reducir movimiento equivale al reposo", () => {
    expect(lensUniforms(W, H, 1, 1, true, 0.7)).toEqual(
      lensUniforms(W, H, 0, 0, false, 0.7),
    );
  });

  test("el progreso se acota sin inventar sobrepaso", () => {
    expect(lensUniforms(W, H, -5, 0, false)).toEqual(lensUniforms(W, H, 0, 0, false));
    expect(lensUniforms(W, H, 5, 0, false)).toEqual(lensUniforms(W, H, 1, 0, false));
    expect(lensUniforms(W, H, Number.NaN, 0, false)).toEqual(
      lensUniforms(W, H, 0, 0, false),
    );
  });

  test("la frontera entra desde debajo y termina atravesando las acciones", () => {
    const rest = lensUniforms(W, H, 0, 0, false, 0).boundary;
    const full = lensUniforms(W, H, 1, 0, false, 0).boundary;
    expect(rest).toBeGreaterThan(H);
    expect(full / H).toBeCloseTo(0.43, 3);
  });

  test("la entrada nace como cúpula junto al orbe, no como una línea de lado a lado", () => {
    const early = lensUniforms(W, H, 0.1, 0, false, 0);
    const centerEdge = early.boundary - early.bow;
    expect(centerEdge).toBeLessThan(H);
    expect(early.boundary).toBeGreaterThan(H);
  });

  test("el cuerpo de la lente es denso sin perder por completo el fondo", () => {
    const full = lensUniforms(W, H, 1, 0, false);
    expect(full.veil).toBeGreaterThan(0.9);
    expect(full.veil).toBeLessThan(0.94);
  });

  test("el pulso externo sólo modula el desplazamiento y nunca más de 20%", () => {
    const quiet = lensUniforms(W, H, 1, 0, false, 0.3);
    const loud = lensUniforms(W, H, 1, 1, false, 0.3);
    expect(loud.displacement / quiet.displacement).toBeCloseTo(1.2, 6);
    expect(loud.boundary).toBe(quiet.boundary);
    expect(loud.bow).toBe(quiet.bow);
    expect(loud.veil).toBe(quiet.veil);
  });

  test("la respiración transforma la silueta, no sólo su altura", () => {
    const a = lensUniforms(W, H, 1, 0, false, 0.08);
    const b = lensUniforms(W, H, 1, 0, false, 0.41);
    expect(b.boundary).not.toBeCloseTo(a.boundary, 4);
    expect(b.bow).not.toBeCloseTo(a.bow, 4);
    expect(b.edgeTilt).not.toBeCloseTo(a.edgeTilt, 4);
    expect(b.ripple).not.toBeCloseTo(a.ripple, 4);
  });

  test("la entrada gana un pliegue transitorio y vuelve a la forma estable", () => {
    const entering = lensUniforms(W, H, 0.5, 0, false, 0);
    const settled = lensUniforms(W, H, 1, 0, false, 0);
    expect(entering.bow).toBeGreaterThan(settled.bow);
    expect(entering.edgeTilt).toBeGreaterThan(settled.edgeTilt);
  });

  test("la liberación nace en el orbe y expande una onda hasta el techo", () => {
    const start = lensUniforms(W, H, 0, 0, false, 0, 0);
    const middle = lensUniforms(W, H, 0, 0, false, 0, 0.5);
    const end = lensUniforms(W, H, 0, 0, false, 0, 1);
    expect(start.dropOrigin).toEqual([W * 0.5, H * 0.91]);
    expect(start.dropRadius).toBe(0);
    expect(middle.dropRadius).toBeGreaterThan(H * 0.5);
    expect(end.dropRadius).toBeGreaterThan(H);
    expect(end.release).toBe(1);
  });

  test("la liberación hunde el menisco sin saltar en ninguno de sus extremos", () => {
    const active = lensUniforms(W, H, 1, 0, false, 0, 0);
    const impact = lensUniforms(W, H, 1, 0, false, 0, 0.5);
    const cleared = lensUniforms(W, H, 1, 0, false, 0, 1);

    expect(impact.boundary).toBeGreaterThan(active.boundary);
    expect(impact.bow).toBeLessThan(active.bow);
    expect(impact.ripple).toBeGreaterThan(active.ripple);
    expect(cleared.boundary).toBeCloseTo(active.boundary, 6);
    expect(cleared.bow).toBeCloseTo(active.bow, 6);
  });

  test("el ciclo respiratorio cierra sin costura", () => {
    expect(lensUniforms(W, H, 1, 0, false, 1)).toEqual(
      lensUniforms(W, H, 1, 0, false, 0),
    );
  });

  test("la geometría sigue siendo proporcional al viewport", () => {
    const a = lensUniforms(W, H, 1, 0, false, 0.37);
    const b = lensUniforms(W * 2, H * 2, 1, 0, false, 0.37);
    expect(b.boundary / a.boundary).toBeCloseTo(2, 6);
    expect(b.displacement / a.displacement).toBeCloseTo(2, 6);
    expect(b.feather / a.feather).toBeCloseTo(2, 6);
    expect(b.edgeTilt / a.edgeTilt).toBeCloseTo(2, 6);
  });

  test("el control lidera y la salida queda en la ventana medida de Monogram", () => {
    expect(LENS_TIMING.controlMs).toBeLessThan(LENS_TIMING.enterMs + LENS_TIMING.leadMs);
    expect(LENS_TIMING.dimMs).toBeLessThan(LENS_TIMING.enterMs);
    // ⚠️ **SE SALE A PROPÓSITO DE LA VENTANA MEDIDA (350–480 ms).** El usuario pidió expresamente
    // una salida «más fluida y lenta», y esa decisión de producto gana sobre la fidelidad al clip.
    // Queda escrito para que nadie lo lea como una regresión: si algún día se quiere volver a la
    // referencia, el valor a restaurar es 480.
    expect(LENS_TIMING.releaseMs).toBeGreaterThanOrEqual(350);
    expect(LENS_TIMING.releaseMs).toBeLessThanOrEqual(1000);
  });
});
