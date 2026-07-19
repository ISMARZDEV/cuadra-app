import { describe, expect, it } from "vitest";

import { buildKpis } from "./OrchestrationKpis";

// Un KPI que muestra `0` cuando en realidad NO PUDIMOS PREGUNTAR es la mentira más cara de una
// consola operativa: el operador concluye "la corrida no encontró nada" y no investiga.
function flow(over: Partial<Record<string, unknown>> = {}) {
  return {
    policy: { policy_id: "p-1", enabled: true, execution_mode: "manual" },
    last_run_metrics: { auto_linked: 5, queued_for_review: 2, new_canonicals: 1 },
    ...over,
  } as never;
}

describe("buildKpis", () => {
  it("suma las métricas de todos los flujos", () => {
    const kpis = buildKpis([flow(), flow()], false);

    expect(kpis.find((k) => k.labelKey.endsWith("autoLinked"))?.value).toBe("10");
    expect(kpis.find((k) => k.labelKey.endsWith("queued"))?.value).toBe("4");
    expect(kpis.find((k) => k.labelKey.endsWith("newCanonicals"))?.value).toBe("2");
  });

  it("muestra guiones y NO ceros cuando el runner está caído", () => {
    const kpis = buildKpis([flow()], true);

    const metricValues = kpis
      .filter((k) => !k.labelKey.endsWith("activeFlows"))
      .map((k) => k.value);
    expect(metricValues).toEqual(["—", "—", "—"]);
  });

  it("cuenta los flujos activos aunque el runner esté caído", () => {
    // Los flujos viven en NUESTRA DB: ese número se sabe con o sin runner. Degradarlo también
    // sería esconder información que sí tenemos.
    const kpis = buildKpis([flow(), flow({ policy: { policy_id: "p-2", enabled: false } })], true);

    expect(kpis.find((k) => k.labelKey.endsWith("activeFlows"))?.value).toBe("1/2");
  });

  it("un flujo sin corridas cuenta como cero, no rompe", () => {
    const kpis = buildKpis([flow({ last_run_metrics: null })], false);

    expect(kpis.find((k) => k.labelKey.endsWith("autoLinked"))?.value).toBe("0");
  });
});
