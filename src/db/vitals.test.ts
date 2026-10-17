import { describe, expect, it } from "vitest";
import { groupFitRows, mapFitRow } from "./vitals";

// No database here (same convention as timescale.test.ts): guards the row -> OlsFit mapping,
// including the toolkit's null edge cases. Real verification against Tiger Cloud is
// `scripts/verify-vitals-sql.ts` (T-007).
describe("mapFitRow", () => {
  it("is null when there are fewer than 2 points, matching olsFit", () => {
    expect(mapFitRow(undefined)).toBeNull();
    expect(mapFitRow({ n: null, slope_per_day: null, intercept: null, r2: null, x_mean: null, y_mean: null })).toBeNull();
    expect(mapFitRow({ n: 1, slope_per_day: 0, intercept: 5, r2: 1, x_mean: 100, y_mean: 5 })).toBeNull();
  });

  it("treats a null determination_coeff (no y variance) as r2 = 1, matching olsFit's syy === 0 branch", () => {
    const fit = mapFitRow({ n: 5, slope_per_day: 0, intercept: 7, r2: null, x_mean: 100, y_mean: 7 });
    expect(fit?.r2).toBe(1);
  });

  it("accepts a bigint-as-string n from the driver", () => {
    const fit = mapFitRow({ n: "14", slope_per_day: 0.1, intercept: 2, r2: 0.9, x_mean: 50, y_mean: 7 });
    expect(fit?.n).toBe(14);
  });

  it("passes slope/intercept/r2/means through unchanged otherwise", () => {
    const fit = mapFitRow({ n: 30, slope_per_day: 0.05, intercept: 120, r2: 0.87, x_mean: 20000, y_mean: 130 });
    expect(fit).toEqual({ n: 30, slopePerDay: 0.05, intercept: 120, r2: 0.87, xMean: 20000, yMean: 130 });
  });
});

// T-012: olsFitBatchSql/olsFitRawBatchSql group a single batched query's rows by (patient_id,
// metric) instead of one round trip per pair; groupFitRows is the pure part of that, so it's
// covered without a database (same convention as mapFitRow above).
describe("groupFitRows", () => {
  it("nests rows by patient then metric", () => {
    const grouped = groupFitRows([
      { patient_id: "p1", metric: "weight_kg", n: 10, slope_per_day: 0.01, intercept: 70, r2: 0.5, x_mean: 100, y_mean: 70 },
      { patient_id: "p1", metric: "bp_systolic", n: 20, slope_per_day: 0.02, intercept: 120, r2: 0.6, x_mean: 100, y_mean: 120 },
      { patient_id: "p2", metric: "weight_kg", n: 5, slope_per_day: 0, intercept: 80, r2: 1, x_mean: 50, y_mean: 80 },
    ]);
    expect([...grouped.keys()]).toEqual(["p1", "p2"]);
    expect(grouped.get("p1")?.get("weight_kg")?.n).toBe(10);
    expect(grouped.get("p1")?.get("bp_systolic")?.n).toBe(20);
    expect(grouped.get("p2")?.get("weight_kg")?.n).toBe(5);
  });

  it("drops a (patient, metric) pair mapFitRow would null out, same as the single-pair functions", () => {
    const grouped = groupFitRows([
      { patient_id: "p1", metric: "weight_kg", n: 1, slope_per_day: 0, intercept: 70, r2: 1, x_mean: 100, y_mean: 70 },
      { patient_id: "p1", metric: "steps", n: 10, slope_per_day: 1, intercept: 8000, r2: 0.4, x_mean: 100, y_mean: 8000 },
    ]);
    expect(grouped.get("p1")?.has("weight_kg")).toBe(false);
    expect(grouped.get("p1")?.get("steps")?.n).toBe(10);
  });

  it("returns an empty map for no rows", () => {
    expect(groupFitRows([]).size).toBe(0);
  });
});
