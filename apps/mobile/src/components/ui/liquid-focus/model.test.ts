import { describe, expect, test } from "vitest";

import { LENS_TIMING, lensUniforms, transcriptHeightInfluence } from "./model";

const W = 390;
const H = 844;

describe("lensUniforms", () => {
  test("normaliza la altura del dictado de una a cuatro líneas", () => {
    expect(transcriptHeightInfluence(32)).toBe(0);
    expect(transcriptHeightInfluence(64)).toBeCloseTo(1 / 3, 6);
    expect(transcriptHeightInfluence(128)).toBe(1);
    expect(transcriptHeightInfluence(400)).toBe(1);
    expect(transcriptHeightInfluence(Number.NaN)).toBe(0);
  });

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
    expect(u.ambientBlur).toBe(0);
    expect(u.ambientVeil).toBe(0);
    expect(u.ambientDisplacement).toBe(0);
    expect(u.edgeTilt).toBe(0);
    expect(u.ripple).toBe(0);
    expect(u.domePulse).toBe(0);
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

  test("el plano superior respira mucho más tenue que la cúpula", () => {
    const full = lensUniforms(W, H, 1, 0, false, 0.3);
    expect(full.ambientBlur).toBeGreaterThan(0.3);
    expect(full.ambientBlur).toBeLessThan(0.5);
    expect(full.ambientVeil).toBeGreaterThan(0.04);
    expect(full.ambientVeil).toBeLessThan(full.veil * 0.1);
    expect(full.ambientDisplacement).toBeGreaterThan(0.08);
    expect(full.ambientDisplacement).toBeLessThan(0.15);
  });

  test("la voz amplifica la membrana completa, no sólo el desplazamiento interno", () => {
    const quiet = lensUniforms(W, H, 1, 0, false, 0.3);
    const loud = lensUniforms(W, H, 1, 1, false, 0.3);
    expect(loud.displacement / quiet.displacement).toBeCloseTo(1.52, 6);
    expect(loud.boundary).toBeLessThan(quiet.boundary);
    expect(loud.bow).toBeGreaterThan(quiet.bow);
    expect(loud.ripple).toBeGreaterThan(quiet.ripple);
    expect(loud.domePulse).toBeGreaterThan(quiet.domePulse);
    expect(loud.veil).toBe(quiet.veil);
  });

  test("la presión del contacto levanta y contrae el menisco sin crear otro estado visual", () => {
    const quiet = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0);
    const pressed = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 1, 0);

    expect(pressed.boundary).toBeLessThan(quiet.boundary - H * 0.025);
    expect(pressed.bow).toBeGreaterThan(quiet.bow);
    expect(pressed.displacement).toBeGreaterThan(quiet.displacement);
    expect(pressed.ripple).toBeGreaterThan(quiet.ripple);
    expect(pressed.domePulse).toBeGreaterThan(quiet.domePulse);
  });

  test("la altura del dictado empuja el plano hacia arriba con un aporte acotado", () => {
    const oneLine = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0);
    const severalLines = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 1);
    const clamped = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 8);

    expect(severalLines.boundary).toBeLessThan(oneLine.boundary);
    expect(severalLines.bow).toBeGreaterThan(oneLine.bow);
    expect(severalLines.displacement).toBeGreaterThan(oneLine.displacement);
    expect(severalLines.ripple).toBeGreaterThan(oneLine.ripple);
    expect(clamped).toEqual(severalLines);
  });

  test("voz, presión y texto se combinan pero la subida total conserva un límite", () => {
    const combined = lensUniforms(W, H, 1, 1, false, 0.3, 0, 0, 1, 1);
    const excessive = lensUniforms(W, H, 1, 20, false, 0.3, 0, 0, 20, 20);
    const base = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0);

    expect(combined.boundary).toBeLessThan(base.boundary - H * 0.06);
    expect(excessive).toEqual(combined);
  });

  test("soltar vacío recoge el menisco hacia abajo y estrecha su casquete", () => {
    const open = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0, 0, 0);
    const gathered = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0, 1, 0);

    expect(gathered.gather).toBe(1);
    expect(gathered.boundary).toBeGreaterThan(open.boundary + H * 0.29);
    expect(gathered.bow).toBeGreaterThan(open.bow * 2.5);
    expect(gathered.feather).toBeLessThan(open.feather);
    expect(gathered.displacement).toBeLessThan(open.displacement);
    expect(gathered.domePulse).toBe(open.domePulse);
  });

  test("una voz detectada cancela por completo la recogida aunque el texto final tarde", () => {
    const held = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0, 0, 1);
    const retreatRequested = lensUniforms(W, H, 1, 0, false, 0.3, 0, 0, 0, 0, 1, 1);

    expect(retreatRequested.gather).toBe(0);
    expect(retreatRequested).toEqual(held);
  });

  test("la respiración transforma la silueta, no sólo su altura", () => {
    const a = lensUniforms(W, H, 1, 0, false, 0.08);
    const b = lensUniforms(W, H, 1, 0, false, 0.41);
    expect(b.boundary).not.toBeCloseTo(a.boundary, 4);
    expect(b.bow).not.toBeCloseTo(a.bow, 4);
    expect(b.edgeTilt).not.toBeCloseTo(a.edgeTilt, 4);
    expect(b.ripple).not.toBeCloseTo(a.ripple, 4);
    expect(b.domePulse).not.toBeCloseTo(a.domePulse, 4);
  });

  test("la altura estable sube y baja sin quedar fijada en una línea", () => {
    const samples = Array.from({ length: 80 }, (_, index) =>
      lensUniforms(W, H, 1, 0, false, index * 0.31).boundary
    );
    const deltas = samples.slice(1).map((value, index) => value - samples[index]!);

    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(H * 0.025);
    expect(deltas.some((delta) => delta > 0)).toBe(true);
    expect(deltas.some((delta) => delta < 0)).toBe(true);
  });

  test("el casquete alterna contracción y apertura circular sin un pulso fijo", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      lensUniforms(W, H, 1, 0, false, index * 0.29).domePulse
    );

    expect(Math.max(...samples)).toBeGreaterThan(0.45);
    expect(Math.min(...samples)).toBeLessThan(-0.45);
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

  test("la respiración no reinicia en un ciclo corto y avanza de forma continua", () => {
    const oldLoopStart = lensUniforms(W, H, 1, 0, false, 0);
    const oldLoopEnd = lensUniforms(W, H, 1, 0, false, 4.8);
    const before = lensUniforms(W, H, 1, 0, false, 4.79);
    const after = lensUniforms(W, H, 1, 0, false, 4.81);

    expect(oldLoopEnd.boundary).not.toBeCloseTo(oldLoopStart.boundary, 3);
    expect(oldLoopEnd.ripple).not.toBeCloseTo(oldLoopStart.ripple, 3);
    expect(Math.abs(after.boundary - before.boundary)).toBeLessThan(H * 0.002);
    expect(Math.abs(after.ripple - before.ripple)).toBeLessThan(W * 0.004);
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
    expect(LENS_TIMING.emptyRetreatMs).toBeGreaterThanOrEqual(480);
    expect(LENS_TIMING.emptyRetreatMs).toBeLessThan(LENS_TIMING.releaseMs);
  });
});
