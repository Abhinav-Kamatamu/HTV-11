import { describe, expect, it } from "vitest";
import { mapFitRow } from "./vitals";

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
