import { describe, expect, test } from "vitest";

import { orbVisualVisible, pillReplacesOrb, type OrbCycle } from "./orb-handoff";

const BOOLS = [false, true];

function todosLosEstados(): (OrbCycle & { hasText: boolean })[] {
  const out: (OrbCycle & { hasText: boolean })[] = [];
  for (const active of BOOLS)
    for (const pressing of BOOLS)
      for (const thinking of BOOLS)
        for (const curtain of BOOLS)
          for (const hasText of BOOLS)
            out.push({ active, pressing, thinking, curtain, hasText });
  return out;
}

describe("único orbe visual y su morph a «Pensando…»", () => {
  test("orbe y píldora nunca se pintan simultáneamente", () => {
    const dobles = todosLosEstados().filter(
      (s) => orbVisualVisible(s, s.hasText) && pillReplacesOrb(s, s.hasText),
    );
    expect(dobles).toEqual([]);
  });

  test("si está activo y no hay texto, el mismo orbe permanece en TODOS los estados", () => {
    const huecos = todosLosEstados().filter(
      (s) => s.active && !s.hasText && !orbVisualVisible(s, s.hasText),
    );
    expect(huecos).toEqual([]);
  });

  test("con el dedo apoyado manda el orbe aunque ya exista texto", () => {
    const cycle: OrbCycle = { active: true, pressing: true, thinking: true, curtain: true };
    expect(orbVisualVisible(cycle, true)).toBe(true);
    expect(pillReplacesOrb(cycle, true)).toBe(false);
  });

  test("sin dedo, el texto hace morph a píldora durante thinking o curtain", () => {
    const thinking: OrbCycle = { active: true, pressing: false, thinking: true, curtain: false };
    const curtain: OrbCycle = { active: true, pressing: false, thinking: false, curtain: true };
    expect(pillReplacesOrb(thinking, true)).toBe(true);
    expect(pillReplacesOrb(curtain, true)).toBe(true);
  });

  test("un orbe inactivo no deja un fantasma visual", () => {
    const fantasmas = todosLosEstados().filter(
      (s) => !s.active && (orbVisualVisible(s, s.hasText) || pillReplacesOrb(s, s.hasText)),
    );
    expect(fantasmas).toEqual([]);
  });
});
