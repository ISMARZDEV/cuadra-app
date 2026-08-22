import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

/**
 * Un worklet que llama a otro declarado MÁS ABAJO revienta en el dispositivo con
 * «undefined is not a function», y **ningún test normal puede verlo**: en el arnés `"worklet"` es
 * una cadena inerte y el hoisting de funciones de JS hace que todo funcione. Los 553 tests de la
 * suite pasaron verdes mientras la app se caía al abrir la pantalla.
 *
 * El plugin de Babel de Reanimated captura las funciones referenciadas EN EL MOMENTO de crear el
 * worklet, así que el orden de declaración en el fichero deja de ser cosmético y pasa a ser una
 * regla del lenguaje.
 *
 * ⭐ Por eso este test no prueba comportamiento: prueba el CÓDIGO FUENTE. Es la única forma de
 * cazar esta clase de defecto sin un dispositivo delante.
 */
const MOTION_DIR = dirname(fileURLToPath(import.meta.url));

interface Declared {
  name: string;
  /** Dónde se declara, en caracteres desde el principio del fichero. */
  at: number;
  /** El cuerpo, para buscar a quién llama. */
  body: string;
  isWorklet: boolean;
}

/**
 * Saca las funciones de nivel superior de un módulo, con su posición y su cuerpo.
 *
 * Se hace por llaves balanceadas y no con una expresión regular: un cuerpo con objetos anidados
 * —y los hay, los tramos son objetos— rompe cualquier regex que intente cerrar la función.
 */
function topLevelFunctions(source: string): Declared[] {
  const found: Declared[] = [];
  const declaration = /^(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;

  for (const match of source.matchAll(declaration)) {
    const at = match.index ?? 0;
    const open = source.indexOf("{", at);
    if (open === -1) continue;

    let depth = 0;
    let close = open;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }

    const body = source.slice(open, close + 1);
    found.push({ name: match[1], at, body, isWorklet: /"worklet"|'worklet'/.test(body) });
  }

  return found;
}

const modules = readdirSync(MOTION_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("el orden de declaración de los worklets", () => {
  test("hay módulos de movimiento que revisar", () => {
    // Si el filtro deja de encontrar ficheros, este test se volvería un aprobado silencioso y no
    // protegería nada. Que falle en voz alta es preferible.
    expect(modules.length).toBeGreaterThan(0);
  });

  test.each(modules)("%s: ningún worklet llama a otro declarado más abajo", (file) => {
    const source = readFileSync(join(MOTION_DIR, file), "utf8");
    const functions = topLevelFunctions(source);
    const worklets = functions.filter((f) => f.isWorklet);

    const offences: string[] = [];

    for (const caller of worklets) {
      for (const callee of worklets) {
        if (callee.name === caller.name) continue;
        // Llamada de verdad —`nombre(`— y no una mención en un comentario: por eso se exige el
        // paréntesis y que el carácter previo no sea parte de un identificador.
        const call = new RegExp(`(^|[^A-Za-z0-9_.\`])${callee.name}\\s*\\(`);
        if (call.test(caller.body) && callee.at > caller.at) {
          offences.push(
            `${caller.name}() llama a ${callee.name}(), que se declara DESPUÉS. ` +
              `Mueve ${callee.name} por encima de ${caller.name}.`,
          );
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
