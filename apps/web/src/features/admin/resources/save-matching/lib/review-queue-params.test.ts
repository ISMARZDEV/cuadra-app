import { describe, expect, it } from "vitest";

import { parseReviewQueueParams, serializeReviewQueueParams } from "./review-queue-params";

// Prueba de "link compartible": el estado de filtros de la cola de revisión debe sobrevivir un
// viaje completo por la URL — parsear lo que serializamos debe devolver EXACTAMENTE el mismo
// estado. Pura (sin DOM/vike): no se necesita un browser para probar esto (batch 2.14).
describe("review-queue-params", () => {
  it("round-trips full filter/sort/pagination state through the URL", () => {
    const params = parseReviewQueueParams({
      provider_id: "prov-1",
      method: "llm",
      confidence_min: "0.55",
      confidence_max: "0.84",
      run_id: "run-aaa",
      order_by: "created_at",
      limit: "25",
      offset: "50",
    });

    const qs = serializeReviewQueueParams(params);
    const roundTripped = parseReviewQueueParams(Object.fromEntries(qs.entries()));

    expect(roundTripped).toEqual(params);
  });

  it("carries run_id (deep-link corrida→cola, F4 #4.7) through parse↔serialize", () => {
    const params = parseReviewQueueParams({ run_id: "dagster-run-123" });
    expect(params.run_id).toBe("dagster-run-123");

    const qs = serializeReviewQueueParams(params);
    expect(qs.get("run_id")).toBe("dagster-run-123");
  });

  it("defaults to uncertainty order + DO market + omits defaults from the URL (clean shareable link)", () => {
    const params = parseReviewQueueParams({});

    expect(params.order_by).toBe("uncertainty");
    expect(params.market).toBe("DO");
    expect(params.limit).toBe(10);
    expect(params.offset).toBe(0);

    const qs = serializeReviewQueueParams(params);
    expect(qs.toString()).toBe("");
  });

  it("falls back to uncertainty for an invalid order_by value (never trusts a raw URL string)", () => {
    const params = parseReviewQueueParams({ order_by: "bogus" });
    expect(params.order_by).toBe("uncertainty");
  });

  it("ignores a malformed confidence_min instead of poisoning the filter with NaN", () => {
    const params = parseReviewQueueParams({ confidence_min: "not-a-number" });
    expect(params.confidence_min).toBeUndefined();
  });
});
