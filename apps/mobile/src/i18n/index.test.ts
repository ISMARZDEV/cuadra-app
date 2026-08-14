import { describe, expect, test } from "vitest";

import en from "./en.json";
import es from "./es.json";
import { setLanguage, t } from "./index";
import pt from "./pt.json";

describe("i18n", () => {
  test("translates a known key in the active language", () => {
    setLanguage("es");
    expect(t("chat.a11y.send")).toBe("Enviar");
    setLanguage("en");
    expect(t("chat.a11y.send")).toBe("Send");
    setLanguage("pt");
    expect(t("chat.a11y.send")).toBe("Enviar");
  });

  test("every language exposes the same keys", () => {
    setLanguage("en");
    expect(t("chat.inputPlaceholder")).toBe("Ask me something...");
    setLanguage("es"); // reset for other tests
  });

  // El de arriba NO compara idiomas pese a su nombre: mira UNA clave en inglés. Éste sí.
  //
  // Es la red que faltaba: agregar una cadena y olvidar uno de los tres archivos no rompe nada en
  // desarrollo —`t()` devuelve la clave cruda— y se descubre en producción, en el idioma que el
  // que la escribió no usa. Comparar los tres conjuntos cuesta una línea y lo pesca al escribirlo.
  test("los tres idiomas tienen EXACTAMENTE las mismas claves", () => {
    const keys = (dict: Record<string, string>) => Object.keys(dict).sort();

    expect(keys(en)).toEqual(keys(es));
    expect(keys(pt)).toEqual(keys(es));
  });

  // Una clave presente pero VACÍA pasa el test de arriba y falla igual en pantalla.
  test("ninguna traducción está vacía", () => {
    for (const [lang, dict] of Object.entries({ es, en, pt })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${lang} → ${key}`).not.toBe("");
      }
    }
  });
});
