import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * GUARDIÁN DEL CONTRATO DE WORKLETS — para TODOS los módulos que corren en el hilo de UI.
 *
 * ⚠️⚠️ **Existe porque el anterior no me protegió, y el motivo importa.** Había un guardián igual
 * atado a `liquid-focus/model.ts`; al escribir `magic-dissolve.ts` —un módulo NUEVO con el mismo
 * problema— no cubría nada, y la app volvió a reventar con «Tried to synchronously call a
 * non-worklet function». Un guardián que enumera archivos protege los archivos que ya existían;
 * el defecto siempre llega en el siguiente.
 *
 * Este mira una LISTA EXPLÍCITA que hay que ampliar al crear un módulo de worklets — no es
 * automático, pero al menos el fallo es de omisión declarada y no de diseño.
 *
 * ⚠️ Nada de esto lo ve el typecheck ni una prueba normal: en el arnés `"worklet"` es una cadena
 * inerte y el hoisting funciona. Ver `cuadra-motion` §12.
 */

const RAIZ = join(__dirname, "..");

/** Módulos cuyas funciones se llaman desde `useAnimatedStyle`, `useDerivedValue` o un worklet. */
const MODULOS = [
  "components/ui/liquid-focus/model.ts",
  "features/aispace/voice/text-shimmer.ts",
];

/** Toda declaración de función del módulo, con su posición. */
function funciones(fuente: string): { nombre: string; en: number }[] {
  const out: { nombre: string; en: number }[] = [];
  const re = /^(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente)) !== null) out.push({ nombre: m[1], en: m.index });
  return out;
}

/** El cuerpo de una función, desde la llave que abre línea. Ver por qué no se busca `") {"` abajo. */
function cabezaDelCuerpo(fuente: string, desde: number): string {
  // ⚠️ Se busca `{\n` y NO `") {"`: una firma como `): number {` no casa con lo segundo, y entonces
  // se encontraba una llave POSTERIOR —ya dentro de otra función— y se leía SU directiva. El
  // guardián pasaba con la directiva quitada. Comprobado quitándola.
  const abre = fuente.indexOf("{\n", desde);
  return abre === -1 ? "" : fuente.slice(abre, abre + 220);
}

describe.each(MODULOS)("contrato de worklets · %s", (relativo) => {
  const fuente = readFileSync(join(RAIZ, relativo), "utf8");
  const fns = funciones(fuente);

  test("el módulo declara al menos una función", () => {
    expect(fns.length).toBeGreaterThan(0);
  });

  test("TODAS llevan la directiva `worklet`", () => {
    // Una sola sin marcar basta para tumbar la app: la llamará otra que sí lo es.
    const sinMarcar = fns
      .filter(({ nombre, en }) => !cabezaDelCuerpo(fuente, en).includes('"worklet"') && nombre)
      .map(({ nombre }) => nombre);
    expect(sinMarcar).toEqual([]);
  });

  test("ninguna llama a otra declarada MÁS ABAJO", () => {
    // El plugin de Babel captura lo referenciado al CREAR el worklet, así que el hoisting normal de
    // JS no aplica: llamar hacia abajo da `undefined is not a function` en el dispositivo.
    const malas: string[] = [];
    for (const { nombre, en } of fns) {
      const cuerpo = fuente.slice(en, siguiente(fns, en, fuente.length));
      for (const otra of fns) {
        if (otra.nombre === nombre || otra.en <= en) continue;
        // Se busca la LLAMADA, no la mención en un comentario.
        if (new RegExp(`\\b${otra.nombre}\\s*\\(`).test(cuerpo.replace(/\/\/.*$/gm, ""))) {
          malas.push(`${nombre} → ${otra.nombre}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });
});

function siguiente(fns: { en: number }[], actual: number, fin: number): number {
  const posteriores = fns.filter((f) => f.en > actual).map((f) => f.en);
  return posteriores.length ? Math.min(...posteriores) : fin;
}
