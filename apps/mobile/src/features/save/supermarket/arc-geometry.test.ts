import { describe, expect, test } from "vitest";

import {
  ARC_BOTTOM_PAD,
  CIRCLE_SIZE,
  SLOT_ANGLES,
  VISIBLE_SLOTS,
  angleForSlot,
  arcFor,
  headerBlockHeight,
  initialRotation,
  maxRotation,
  pointOnArc,
} from "./arc-geometry";

// La curva del header y las posiciones de los círculos NO se eligieron: se MIDIERON sobre la
// referencia del diseño, muestreando el borde del verde píxel a píxel. Lo que se afirma acá es que
// el modelo reproduce esas medidas — si alguien toca las proporciones, estos números lo delatan.
//
// La referencia mide 1067px de ancho de pantalla a 2.715 px/pt, o sea 393pt.
const W = 393;

describe("el arco del header", () => {
  test("reproduce las tres medidas de la referencia", () => {
    const arc = arcFor(W);
    expect(arc.sideY).toBeCloseTo(110.9, 0);
    expect(arc.centerY).toBeCloseTo(231.0, 0);
    expect(arc.r).toBeCloseTo(220.8, 0);
    expect(arc.cy).toBeCloseTo(10.2, 0);
    expect(arc.cx).toBe(W / 2);
  });

  test("la panza baja ~120pt en el centro", () => {
    const arc = arcFor(W);
    expect(arc.centerY - arc.sideY).toBeCloseTo(120, 0);
  });

  test("ESCALA con el ancho en vez de ser una constante", () => {
    // La misma lección que la sangría del hub: un número fijo es holgado en un Pro Max y desborda
    // en un SE. El arco tiene que cruzar la pantalla, mida lo que mida.
    expect(arcFor(320).centerY).toBeLessThan(arcFor(440).centerY);
    expect(arcFor(320).cx).toBe(160);
  });
});

describe("las ranuras en reposo", () => {
  test("son CUATRO y dejan el centro vacío", () => {
    expect(VISIBLE_SLOTS).toBe(4);
    expect(SLOT_ANGLES).not.toContain(0);
  });

  test("el hueco central mide el DOBLE que la separación normal", () => {
    // Ése es el sitio reservado a la campana y al indicador. Es lo que hace que la red de ranuras
    // NO sea uniforme, y de ahí sale todo el comportamiento de la rueda.
    expect(SLOT_ANGLES).toEqual([-46, -23, 23, 46]);
    expect(SLOT_ANGLES[2] - SLOT_ANGLES[1]).toBe(2 * (SLOT_ANGLES[1] - SLOT_ANGLES[0]));
  });

  test("la primera ranura cae donde el diseño puso «Frutas & Verduras»", () => {
    // Medido: centro del círculo en x=38.7pt, y=165.7pt desde el techo de la pantalla.
    const p = pointOnArc(arcFor(W), SLOT_ANGLES[0]);
    expect(p.x).toBeCloseTo(38, 0);
    expect(p.y).toBeCloseTo(164, 0);
  });

  test("el centro del arco es el punto más BAJO", () => {
    const arc = arcFor(W);
    for (const a of SLOT_ANGLES) expect(pointOnArc(arc, a).y).toBeLessThan(arc.centerY);
  });
});

// ── La rueda ──────────────────────────────────────────────────────────────────
describe("el giro de la rueda", () => {
  test("las posiciones enteras SON las cuatro ranuras del diseño", () => {
    expect([0, 1, 2, 3].map(angleForSlot)).toEqual([...SLOT_ANGLES]);
  });

  test("sigue habiendo red fuera de la pantalla, hacia los dos lados", () => {
    // Sin esto, la categoría que entra aparecería de la nada en el borde en vez de venir subiendo.
    expect(angleForSlot(-1)).toBe(-69);
    expect(angleForSlot(4)).toBe(69);
  });

  test("a media ranura, a mitad de camino: la rueda GIRA, no salta", () => {
    expect(angleForSlot(0.5)).toBeCloseTo(-34.5, 5);
    expect(angleForSlot(2.5)).toBeCloseTo(34.5, 5);
  });

  test("quien cruza el centro pasa EXACTAMENTE por el punto más bajo", () => {
    // Entre la ranura 1 y la 2 está el hueco de la campana. A mitad de ese tramo la categoría está
    // en el fondo de la panza — que es justo por donde tiene que barrer.
    expect(angleForSlot(1.5)).toBeCloseTo(0, 5);
  });

  test("cruzar el centro va al DOBLE de velocidad angular", () => {
    // Consecuencia de que el hueco mida el doble, y es deliberado: así la categoría barre por
    // debajo de la campana en vez de quedarse plantada delante de ella.
    const cruzando = angleForSlot(1.6) - angleForSlot(1.5);
    const normal = angleForSlot(0.6) - angleForSlot(0.5);
    expect(cruzando).toBeCloseTo(2 * normal, 5);
  });

  test("el ángulo crece siempre: la rueda nunca retrocede a mitad de giro", () => {
    let previo = -Infinity;
    for (let s = -1; s <= 4; s += 0.1) {
      const a = angleForSlot(s);
      expect(a).toBeGreaterThan(previo);
      previo = a;
    }
  });
});

describe("los topes del giro", () => {
  test("con 17 categorías y 4 a la vista quedan 13 pasos de recorrido", () => {
    expect(maxRotation(17)).toBe(13);
  });

  test("si caben todas, no hay nada que girar", () => {
    // Sin tope a 0 se podría arrastrar hacia el vacío y dejar el arco pelado.
    expect(maxRotation(4)).toBe(0);
    expect(maxRotation(2)).toBe(0);
  });

  test("abre por el MEDIO, para poder ir hacia los dos lados", () => {
    expect(initialRotation(17)).toBe(7);
    expect(initialRotation(17)).toBeLessThan(maxRotation(17));
    expect(initialRotation(17)).toBeGreaterThan(0);
  });

  test("con pocas categorías abre al principio y no se mueve", () => {
    expect(initialRotation(4)).toBe(0);
  });
});

describe("la caja del header", () => {

  test("reserva sitio para quien CRUZA el centro, no sólo para las cuatro en reposo", () => {
    // Quien baja por la panza cuelga más que ninguna de las paradas. Sin este hueco, al girar la
    // rueda la categoría que pasa se saldría del header.
    const arc = arcFor(W);
    const masBajaEnReposo = Math.max(...SLOT_ANGLES.map((a) => pointOnArc(arc, a).y));
    expect(headerBlockHeight(W)).toBe(arc.centerY + CIRCLE_SIZE / 2 + ARC_BOTTOM_PAD);
    expect(headerBlockHeight(W)).toBeGreaterThan(masBajaEnReposo + CIRCLE_SIZE / 2);
  });

});
