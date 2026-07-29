import type { SourcePlatform } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { PROVIDER_TYPE_OPTIONS, SOURCE_PLATFORM_OPTIONS } from "./types";

// REGRESIÓN: `SOURCE_PLATFORM_OPTIONS` era un array escrito a mano y se quedó sin `rest_catalog`
// cuando el backend lo agregó. El fallo era MUDO: al editar Bravo (que es `rest_catalog`) el select
// aparecía vacío y guardar le cambiaba la plataforma en silencio.
//
// La defensa real es de tipos —`Record<SourcePlatform, …>` no compila si falta un miembro— pero este
// test deja la regla escrita y falla en rojo si alguien vuelve a un array suelto.
describe("opciones de proveedor", () => {
  it("cubre TODAS las plataformas del contrato del backend", () => {
    // Repetido a propósito: si el backend agrega una plataforma, este literal deja de compilar
    // (`Record` exige exhaustividad) y obliga a mirar también la lista de la UI.
    const everyPlatform: Record<SourcePlatform, true> = {
      vtex: true,
      magento: true,
      shopify: true,
      aggregator: true,
      spa: true,
      rest_catalog: true,
    };

    expect([...SOURCE_PLATFORM_OPTIONS].sort()).toEqual(Object.keys(everyPlatform).sort());
  });

  it("incluye rest_catalog — la plataforma de Bravo", () => {
    expect(SOURCE_PLATFORM_OPTIONS).toContain("rest_catalog");
  });

  it("cubre los tres tipos de proveedor", () => {
    expect([...PROVIDER_TYPE_OPTIONS].sort()).toEqual(["bank", "insurer", "supermarket"]);
  });
});
