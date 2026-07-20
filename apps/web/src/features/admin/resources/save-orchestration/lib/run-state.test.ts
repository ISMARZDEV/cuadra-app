import { describe, expect, it } from "vitest";

import { isCancellable, isInFlight } from "./run-state";

// Afordancias del RUNNER, derivadas del estado que él declara. Espejan `RunState.is_cancellable`
// del dominio: ofrecer "Cancelar" sobre algo que ya terminó (o que ya se está cancelando) es un
// botón que no hace nada, y eso erosiona la confianza en la consola entera.
describe("isCancellable", () => {
  it("allows cancelling only what is actually in flight", () => {
    expect(isCancellable("queued")).toBe(true);
    expect(isCancellable("running")).toBe(true);
  });

  it("refuses terminal states and the already-cancelling one", () => {
    expect(isCancellable("canceling")).toBe(false);
    expect(isCancellable("succeeded")).toBe(false);
    expect(isCancellable("failed")).toBe(false);
    expect(isCancellable("canceled")).toBe(false);
  });

  it("refuses `unknown` — an unrecognised state enables NO action", () => {
    // Dagster declara su GraphQL inestable: un estado que no reconocemos NO puede habilitar una
    // mutación. `unknown` es "no sabemos", no "probemos a ver".
    expect(isCancellable("unknown")).toBe(false);
  });

  it("refuses null — a flow that never ran has nothing to cancel", () => {
    expect(isCancellable(null)).toBe(false);
    expect(isCancellable(undefined)).toBe(false);
  });
});

describe("isInFlight", () => {
  it("is true while the runner still owes us an outcome", () => {
    expect(isInFlight("queued")).toBe(true);
    expect(isInFlight("running")).toBe(true);
    // `canceling` SÍ está en vuelo aunque no sea cancelable: la corrida sigue viva y su estado va a
    // cambiar solo. Es justo cuando el operador más quiere ver la tabla moverse.
    expect(isInFlight("canceling")).toBe(true);
  });

  it("is false once the run reached a terminal state", () => {
    expect(isInFlight("succeeded")).toBe(false);
    expect(isInFlight("failed")).toBe(false);
    expect(isInFlight("canceled")).toBe(false);
  });

  it("is false for unknown and for never-ran", () => {
    // Sin esto el polling nunca pararía: `unknown` no cambia solo, así que refrescar por él sería
    // machacar el runner para siempre.
    expect(isInFlight("unknown")).toBe(false);
    expect(isInFlight(null)).toBe(false);
  });
});
