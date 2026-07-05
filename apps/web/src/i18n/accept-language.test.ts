import { describe, expect, it } from "vitest";

import { pickLocale } from "./accept-language";

describe("pickLocale — negocia el idioma desde Accept-Language (es/en/pt)", () => {
  it("elige el primer idioma soportado por orden de preferencia (q)", () => {
    expect(pickLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLocale("es-DO,es;q=0.9,en;q=0.5")).toBe("es");
    expect(pickLocale("pt-BR,pt;q=0.9,en;q=0.5")).toBe("pt");
  });

  it("respeta el q aunque el orden textual sea otro", () => {
    expect(pickLocale("en;q=0.3, pt;q=0.9")).toBe("pt");
  });

  it("idioma no soportado → default (es)", () => {
    expect(pickLocale("fr-FR,fr;q=0.9")).toBe("es");
    expect(pickLocale("*")).toBe("es");
  });

  it("ausente o vacío → default (es)", () => {
    expect(pickLocale(undefined)).toBe("es");
    expect(pickLocale("")).toBe("es");
  });
});
