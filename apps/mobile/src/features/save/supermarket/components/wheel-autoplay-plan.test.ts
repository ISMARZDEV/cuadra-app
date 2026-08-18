import { describe, expect, test } from "vitest";

import { WHEEL_PAUSE_MS, WHEEL_SLIDE_MS, wheelAutoplayPlan } from "./wheel-autoplay-plan";
import { initialRotation, maxRotation } from "../arc-geometry";

// EL BARRIDO DE PRESENTACIÓN de la ruleta, como plan: a qué ranura y en qué momento.
//
// Lo que se afirma acá NO son los milisegundos —eso es ritmo, y se ajusta mirando— sino la FORMA
// del recorrido, que es lo que se pidió y lo que no puede romperse:
//
//   - arranca en la PRIMERA categoría, no a mitad de la lista;
//   - avanza DE UNA EN UNA, nunca a saltos;
//   - con una cadencia PAREJA, para que se lea como un deslizamiento suave y no como tirones;
//   - y se detiene en la PENÚLTIMA.
//
// Historial, porque este archivo ya se equivocó dos veces: primero eran TRES PASOS FIJOS desde el
// medio (un número que no sabía nada del catálogo, así que llegar al final era casualidad), y
// después un ÚNICO salto hasta el tope (llegaba, sí, pero de un latigazo — «lo está pasando
// rápido», con razón).

const CATS = 17;
const FROM = initialRotation(CATS);
const LIMIT = maxRotation(CATS);

/** Lo que tarda la última categoría en asentar su rebote (ver `POP_*` en `category-arc`). */
const BOUNCE_SETTLED = 1050;

describe("el barrido de presentación de la ruleta", () => {
  const plan = wheelAutoplayPlan({ from: FROM, limit: LIMIT });

  test("arranca en la PRIMERA categoría: el primer paso es un solo puesto", () => {
    expect(FROM).toBe(0);
    expect(plan[0].to).toBe(FROM + 1);
  });

  test("avanza DE UNA EN UNA, nunca a saltos", () => {
    // Ésta es la aserción del «lo está pasando rápido»: un único `scrollTo` al tope cumplía
    // «llega al final» y aun así estaba mal, porque el recorrido no se veía.
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].to - plan[i - 1].to).toBe(1);
    }
  });

  test("se detiene en la PENÚLTIMA", () => {
    expect(plan[plan.length - 1].to).toBe(LIMIT - 1);
  });

  test("la cadencia es PAREJA: ningún paso se adelanta ni se rezaga", () => {
    const gaps = plan.slice(1).map((s, i) => s.at - plan[i].at);

    expect(new Set(gaps).size).toBe(1);
  });

  test("espera a que el rebote de las categorías haya terminado", () => {
    // Arrancando antes, la rueda mueve unos círculos que todavía se están montando: las dos
    // animaciones se estorban y ninguna se lee.
    expect(plan[0].at).toBeGreaterThan(BOUNCE_SETTLED);
  });

  // ⚠️ ESTE PAR DE TESTS DECÍA LO CONTRARIO, y estaba mal.
  //
  // Yo había optimizado para que la rueda pasara el 80% del tiempo MOVIÉNDOSE, razonando que un
  // movimiento largo se lee como suave. Se lee como una CORRIDA: sin descanso entre puestos, las
  // categorías desfilan de un tirón y no se distingue ninguna. El usuario lo dijo exactamente así
  // —«no pasarlas todas de una vez como una corrida»— y tiene razón.
  //
  // Un carrusel de presentación no es un desplazamiento continuo: es una SECUENCIA DE LLEGADAS. Lo
  // que hace legible cada categoría no es lo despacio que viaja, sino el rato que se queda quieta
  // al llegar.
  test("descansa MÁS de lo que se mueve: son llegadas, no una corrida", () => {
    expect(WHEEL_PAUSE_MS).toBeGreaterThan(WHEEL_SLIDE_MS);
  });

  test("la cadencia deja sitio al deslizamiento Y a su pausa", () => {
    const gap = plan[1].at - plan[0].at;

    expect(gap).toBe(WHEEL_SLIDE_MS + WHEEL_PAUSE_MS);
  });

  test("el recorrido no depende de cuántas categorías haya", () => {
    for (const count of [8, 12, 14, 17, 25]) {
      const limit = maxRotation(count);
      const steps = wheelAutoplayPlan({ from: initialRotation(count), limit });

      expect(steps[steps.length - 1].to).toBe(limit - 1);
    }
  });

  test("si no hay nada que girar, no hay nada que presentar", () => {
    // Con 4 categorías o menos caben todas: moverla sería mentir sobre que hay más.
    expect(wheelAutoplayPlan({ from: 0, limit: 0 })).toHaveLength(0);
  });

  test("con un solo puesto de recorrido, lo enseña igual", () => {
    // Caso límite: la penúltima ranura ES la de partida, así que la regla literal no movería nada
    // y el usuario no vería que la rueda gira. Un puesto es poco, pero es lo que hay que enseñar.
    expect(wheelAutoplayPlan({ from: 0, limit: 1 })).toEqual([
      expect.objectContaining({ to: 1 }),
    ]);
  });
});
