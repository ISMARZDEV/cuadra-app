import { describe, expect, it } from "vitest";

import { buildKpis } from "./OrchestrationKpis";

// Un KPI que muestra `0` cuando en realidad NO PUDIMOS PREGUNTAR es la mentira más cara de una
// consola operativa: el operador concluye "la corrida no encontró nada" y no investiga.
function flow(over: Partial<Record<string, unknown>> = {}) {
  return {
    provider_name: "Sirena",
    policy: { policy_id: "p-1", enabled: true, execution_mode: "manual" },
    last_run_metrics: { auto_linked: 5, queued_for_review: 2, new_canonicals: 1 },
    sla_status: "not_applicable",
    ...over,
  } as never;
}

const find = (kpis: ReturnType<typeof buildKpis>, suffix: string) =>
  kpis.find((k) => k.labelKey.endsWith(suffix));

describe("buildKpis — flujos activos", () => {
  it("cuenta los activos aunque el runner esté caído", () => {
    // Los flujos viven en NUESTRA DB: ese número se sabe con o sin runner. Degradarlo también
    // sería esconder información que sí tenemos.
    const kpis = buildKpis(
      [flow(), flow({ policy: { policy_id: "p-2", enabled: false } })],
      true,
    );

    expect(find(kpis, "activeFlows")?.value).toBe("1/2");
    expect(find(kpis, "activeFlows")?.gauge).toBe(50);
  });

  it("distingue 'todos activos' de 'hay pausados' en el badge", () => {
    expect(find(buildKpis([flow()], false), "activeFlows")?.badge?.labelKey).toContain("allActive");

    const withPaused = buildKpis([flow(), flow({ policy: { policy_id: "p-2", enabled: false } })], false);
    expect(find(withPaused, "activeFlows")?.badge?.count).toBe(1);
  });

  it("acompaña el arco con su leyenda: activos vs en pausa", () => {
    // El gauge NUNCA va solo — es el patrón de la Cola de revisión, y un arco suelto en un card
    // ancho queda desbalanceado. La leyenda además da los conteos que el ratio no desglosa.
    const kpis = buildKpis([flow(), flow({ policy: { policy_id: "p-2", enabled: false } })], false);

    expect(find(kpis, "activeFlows")?.legend?.map((l) => l.count)).toEqual([1, 1]);
  });
});

describe("buildKpis — tasa de auto-enlace", () => {
  it("es el ratio sobre lo DECIDIDO, y la leyenda conserva los números absolutos", () => {
    // 5 auto + 2 cola = 7 decididos → 71%. La leyenda muestra 5 y 2, no porcentajes: el operador
    // necesita saber CUÁNTOS quedaron esperándolo.
    const kpi = find(buildKpis([flow()], false), "autoLinkRate");

    expect(kpi?.value).toBe("71%");
    expect(kpi?.legend?.map((l) => l.count)).toEqual([5, 2]);
    expect(kpi?.badge?.count).toBe(2);
  });

  it("muestra `—` y NO `0%` cuando no hubo desenlace que medir", () => {
    // `0%` diría "no enlazó nada"; la verdad es "no hubo nada que decidir".
    const kpi = find(buildKpis([flow({ last_run_metrics: null })], false), "autoLinkRate");

    expect(kpi?.value).toBe("—");
    expect(kpi?.placeholder).toBe(true);
    expect(kpi?.gauge).toBeUndefined();
  });
});

describe("buildKpis — degradado", () => {
  it("no dibuja ni afirma nada de lo que dependa del runner", () => {
    const kpis = buildKpis([flow({ sla_status: "within" })], true);

    const degradables = kpis.filter((k) => !k.labelKey.endsWith("activeFlows"));
    expect(degradables.map((k) => k.value)).toEqual(["—", "—", "—"]);
    // Sin dato no hay chart: un gauge a 0 se leería como "cero por ciento", que es una afirmación.
    expect(degradables.every((k) => k.gauge === undefined && k.bars === undefined)).toBe(true);
  });
});

// SLA — regla cerrada 2026-07-19. La calcula el DOMINIO y llega en `sla_status`; acá solo se AGREGA.
const sla = (status: string) => flow({ sla_status: status });

describe("buildKpis — KPI de SLA", () => {
  it("cuenta los que cumplen sobre los que TIENEN un SLA que cumplir", () => {
    const kpi = find(buildKpis([sla("within"), sla("breached"), sla("within")], false), "withinSla");

    expect(kpi?.value).toBe("2/3");
    expect(kpi?.gauge).toBe(67);
    expect(kpi?.badge?.count).toBe(1);
    // Leyenda: a tiempo vs fuera, con conteos absolutos.
    expect(kpi?.legend?.map((l) => l.count)).toEqual([2, 1]);
  });

  it("EXCLUYE del denominador los que no aplican", () => {
    // Un flujo manual no puede llegar tarde. Contarlo abajo haría que la consola dijera "0/3 dentro
    // de SLA" con todo perfectamente sano — el número que MIENTE EN VERDE.
    expect(find(buildKpis([sla("within"), sla("not_applicable")], false), "withinSla")?.value).toBe(
      "1/1",
    );
  });

  it("muestra `—` y no `0/0` cuando ningún flujo tiene SLA configurado", () => {
    // `0/0` se lee como "ninguno cumple". La verdad es "no hay nada que medir todavía".
    const kpi = find(buildKpis([sla("not_applicable")], false), "withinSla");

    expect(kpi?.value).toBe("—");
    expect(kpi?.badge).toBeUndefined();
  });
});
