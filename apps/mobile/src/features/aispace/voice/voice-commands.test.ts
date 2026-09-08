import { describe, expect, test } from "vitest";

import { applyCommand, detectCommand, normalize } from "./voice-commands";

describe("normalize", () => {
  test("quita tildes, puntuación y mayúsculas — el reconocedor devuelve las tres", () => {
    // «Bórralo.» sale así del reconocedor y tiene que casar con la entrada «borralo».
    expect(normalize("Bórralo.")).toBe("borralo");
    expect(normalize("  ¿Borra   eso?  ")).toBe("borra eso");
  });
});

describe("detectCommand", () => {
  test("reconoce borrar lo último, limpiar y cancelar", () => {
    expect(detectCommand("borra eso", "es")).toBe("undo");
    expect(detectCommand("Empieza de nuevo", "es")).toBe("clear");
    expect(detectCommand("cancela", "es")).toBe("cancel");
  });

  test("⭐ un tramo con MÁS que el comando es TEXTO, no orden", () => {
    // Es el discriminador que hace esto usable. Sin él, dictar sobre casi cualquier tema borraría
    // frases al azar y el usuario no podría saber por qué.
    expect(detectCommand("le dije que borra eso del informe", "es")).toBeNull();
    expect(detectCommand("borra eso y lo otro", "es")).toBeNull();
    expect(detectCommand("quiero empezar de nuevo el proyecto", "es")).toBeNull();
  });

  test("⭐⭐ «no» a secas NUNCA es comando", () => {
    // Es la palabra más común del español. Como comando destruiría texto constantemente.
    expect(detectCommand("no", "es")).toBeNull();
    expect(detectCommand("No.", "es")).toBeNull();
  });

  test("cada idioma tiene su vocabulario, y no se mezclan", () => {
    expect(detectCommand("scratch that", "en")).toBe("undo");
    expect(detectCommand("apaga tudo", "pt")).toBe("clear");
    // Un comando inglés dictado en español es TEXTO: quien habla español no lo dijo como orden.
    expect(detectCommand("scratch that", "es")).toBeNull();
  });

  test("un idioma desconocido cae al español, no revienta", () => {
    expect(detectCommand("borra eso", "zz")).toBe("undo");
  });

  test("vacío no es comando", () => {
    expect(detectCommand("   ", "es")).toBeNull();
  });
});

describe("applyCommand", () => {
  const tramos = ["gasté quinientos pesos", "en el supermercado", "ayer"];

  test("«borra eso» quita SÓLO el último tramo", () => {
    expect(applyCommand(tramos, "undo")).toEqual([
      "gasté quinientos pesos",
      "en el supermercado",
    ]);
  });

  test("borrar con la lista vacía no revienta ni inventa", () => {
    expect(applyCommand([], "undo")).toEqual([]);
  });

  test("limpiar y cancelar dejan el dictado a cero", () => {
    expect(applyCommand(tramos, "clear")).toEqual([]);
    expect(applyCommand(tramos, "cancel")).toEqual([]);
  });

  test("sin comando, los tramos salen intactos", () => {
    expect(applyCommand(tramos, null)).toEqual(tramos);
  });
});
