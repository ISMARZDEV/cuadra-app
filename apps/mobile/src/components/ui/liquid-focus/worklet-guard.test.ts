import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * GUARDIÁN DEL CONTRATO DE WORKLETS — lee el CÓDIGO FUENTE, no lo ejecuta.
 *
 * ⚠️ Existe porque este defecto es INVISIBLE para todo lo demás. `lensUniforms` corre en el hilo de
 * UI y desde un worklet sólo se puede llamar a otros worklets; si a un ayudante se le olvida la
 * directiva, la app revienta EN EL DISPOSITIVO con «Tried to synchronously call a non-worklet
 * function … on the UI thread» — mientras el typecheck sale limpio y los tests en verde, porque en
 * el arnés `"worklet"` no es más que una cadena suelta.
 *
 * Ya pasó una vez, con `windowAt`. Ver `cuadra-motion` §12.
 */
const FUENTE = readFileSync(join(__dirname, "model.ts"), "utf8");

/** Toda función de este módulo que un worklet pueda llamar. */
const AYUDANTES = ["windowAt"];

/**
 * El cuerpo de una función, desde su `) {` hasta 200 caracteres después.
 *
 * Se busca así y no «los primeros N caracteres desde el nombre» porque la firma de `lensUniforms`
 * lleva JSDoc por parámetro y ya se comió una ventana de 600: un guardián que falla porque la
 * documentación creció es un guardián que alguien acabará borrando.
 */
function cabezaDelCuerpo(fuente: string, declaracion: string): string {
  const inicio = fuente.indexOf(declaracion);
  if (inicio === -1) return "";
  // ⚠️ Se busca la llave que ABRE LÍNEA (`{\n`), no `") {"`. Con `") {"` la firma
  // `): number {` no casa, así que encontraba una llave POSTERIOR —ya dentro de otra función— y
  // leía la directiva de ESA. El guardián pasaba con la directiva quitada: comprobado quitándola.
  const abre = fuente.indexOf("{\n", inicio);
  return abre === -1 ? "" : fuente.slice(abre, abre + 200);
}

describe("contrato de worklets en model.ts", () => {
  test("`lensUniforms` sigue siendo un worklet", () => {
    // Si dejara de serlo, el shader no podría leer sus uniforms por fotograma.
    expect(cabezaDelCuerpo(FUENTE, "export function lensUniforms")).toContain('"worklet"');
  });

  test.each(AYUDANTES)("`%s` lleva la directiva `worklet`", (nombre) => {
    expect(FUENTE.indexOf(`function ${nombre}(`)).toBeGreaterThan(-1);
    expect(cabezaDelCuerpo(FUENTE, `function ${nombre}(`)).toContain('"worklet"');
  });

  test.each(AYUDANTES)("`%s` se declara ANTES de `lensUniforms`", (nombre) => {
    // El plugin de Babel captura lo que el worklet referencia EN EL MOMENTO de crearlo, así que el
    // hoisting normal de JS no aplica: declarado más abajo, sale `undefined is not a function`.
    expect(FUENTE.indexOf(`function ${nombre}(`)).toBeLessThan(
      FUENTE.indexOf("export function lensUniforms"),
    );
  });
});
