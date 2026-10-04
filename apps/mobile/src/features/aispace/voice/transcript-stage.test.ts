import { describe, expect, test } from "vitest";

import { transcriptOnStage, type OrbCycle } from "./transcript-stage";

const BOOLS = [false, true];

function todosLosCiclos(): OrbCycle[] {
  const out: OrbCycle[] = [];
  for (const active of BOOLS)
    for (const pressing of BOOLS)
      for (const thinking of BOOLS)
        for (const curtain of BOOLS)
          out.push({ active, pressing, thinking, curtain });
  return out;
}

/** El reposo: el orbe a la vista, sin dedo, sin «pensando» y sin telón. */
const REPOSO: OrbCycle = { active: true, pressing: false, thinking: false, curtain: false };

describe("qué texto se pinta sobre la cúpula", () => {
  /**
   * ⭐⭐⭐ **EL DEFECTO REPORTADO.** Tras enviar un dictado, el reconocedor CONSERVA sus tramos —sólo
   * los limpia al arrancar la sesión siguiente—, así que al volver a revelar el orbe el residuo
   * seguía ahí y se pintaba a plena vista. Aquí el reposo es vacío POR CONSTRUCCIÓN: aunque el
   * residuo llegue, no hay estado en el que pueda salir a pantalla.
   */
  test("en REPOSO no se pinta nada aunque el reconocedor conserve lo dictado", () => {
    expect(transcriptOnStage(REPOSO, "Qué tal tu día hoy cómo te fue", "")).toBe("");
  });

  test("tampoco se pinta el residuo que quedó en el telón anterior", () => {
    expect(transcriptOnStage(REPOSO, "", "Qué tal tu día hoy cómo te fue")).toBe("");
  });

  test("con el orbe oculto nunca hay texto, venga de donde venga", () => {
    const fugas = todosLosCiclos()
      .filter((c) => !c.active)
      .filter((c) => transcriptOnStage(c, "vivo", "enviado") !== "");
    expect(fugas).toEqual([]);
  });

  test("mientras se dicta manda lo que llega EN VIVO", () => {
    const dictando: OrbCycle = { active: true, pressing: true, thinking: false, curtain: false };
    expect(transcriptOnStage(dictando, "hola qué tal", "viejo")).toBe("hola qué tal");
  });

  test("soltado y pensando sigue mandando lo dictado —el texto no puede parpadear ahí", () => {
    const pensando: OrbCycle = { active: true, pressing: false, thinking: true, curtain: false };
    expect(transcriptOnStage(pensando, "hola qué tal", "")).toBe("hola qué tal");
  });

  test("en el telón manda lo ENVIADO, no lo que el reconocedor tenga suelto", () => {
    const telon: OrbCycle = { active: true, pressing: false, thinking: false, curtain: true };
    expect(transcriptOnStage(telon, "residuo a medias", "hola qué tal")).toBe("hola qué tal");
  });

  test("un dictado en blanco no monta una caja vacía en ningún estado", () => {
    const blancos = todosLosCiclos().filter((c) => transcriptOnStage(c, "   ", "  ") !== "");
    expect(blancos).toEqual([]);
  });
});
