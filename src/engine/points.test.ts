import { describe, expect, it } from "vitest";
import {
  applyLayerCap, duration, hasPrimary, maxSeverity, monthDay, num, orderLedger, plural, POINTS, severityFromPoints,
  totalPoints, withUnit, type Contribution,
} from "./points";

const c = (layer: Contribution["layer"], points: number, reason: string = layer): Contribution => ({
  layer, points, reason, evidence: [], sourceIds: [],
});

describe("severityFromPoints", () => {
  it("follows the bands: 0-2 none, 3-5 monitor, 6-9 review, 10+ urgent", () => {
    expect([0, 2, 2.5].map(severityFromPoints)).toEqual([null, null, null]);
    expect([3, 5, 5.5].map(severityFromPoints)).toEqual(["monitor", "monitor", "monitor"]);
    expect([6, 9, 9.5].map(severityFromPoints)).toEqual(["review", "review", "review"]);
    expect([10, 14].map(severityFromPoints)).toEqual(["urgent", "urgent"]);
  });
});

describe("maxSeverity", () => {
  it("treats null as lowest and ranks monitor < review < urgent", () => {
    expect(maxSeverity(null, null)).toBeNull();
    expect(maxSeverity(null, "monitor")).toBe("monitor");
    expect(maxSeverity("review", "monitor")).toBe("review");
    expect(maxSeverity("review", "urgent")).toBe("urgent");
  });
});

describe("applyLayerCap", () => {
  it("leaves a layer at or under the cap alone", () => {
    const out = applyLayerCap([c("trend", 2), c("trend", 2), c("symptom", 3)]);
    expect(totalPoints(out)).toBe(7);
    expect(out.every((x) => !x.reason.includes("cap"))).toBe(true);
  });

  it("trims rows past the cap, keeps them in the ledger and says so", () => {
    const out = applyLayerCap([c("threshold", 4, "a"), c("threshold", 4, "b")]);
    expect(out.map((x) => x.points)).toEqual([4, 0]);
    expect(out[1].reason).toContain("Counted 0 of 4 points (layer cap 4)");
    expect(totalPoints(out)).toBe(4);
  });

  it("partially counts the row that crosses the cap, biggest rows first", () => {
    const out = applyLayerCap([c("trend", 1, "small"), c("trend", 4, "big"), c("trend", 2, "mid")]);
    expect(out.map((x) => [x.reason.split(" ")[0], x.points])).toEqual([["big", 4], ["mid", 0], ["small", 0]]);
  });

  it("caps each layer separately", () => {
    const out = applyLayerCap([c("trend", 4), c("threshold", 4), c("sleep", 2)]);
    expect(totalPoints(out)).toBe(10);
  });

  it("does not mutate its input", () => {
    const input = [c("trend", 4), c("trend", 4)];
    applyLayerCap(input);
    expect(input.map((x) => x.points)).toEqual([4, 4]);
  });
});

describe("orderLedger", () => {
  it("orders by layer, then points descending, keeping ties stable", () => {
    const out = orderLedger([c("sleep", 1), c("trend", 1, "t1"), c("threshold", 2), c("trend", 3, "t3"), c("trend", 1, "t1b")]);
    expect(out.map((x) => x.reason)).toEqual(["threshold", "t3", "t1", "t1b", "sleep"]);
  });
});

describe("hasPrimary", () => {
  it("counts threshold, score, trend, cooccurrence and symptom, but not changepoint, sleep or gap", () => {
    expect(hasPrimary([c("changepoint", 2), c("sleep", 2), c("gap", 1)])).toBe(false);
    for (const layer of ["threshold", "score", "trend", "cooccurrence", "symptom"] as const) {
      expect(hasPrimary([c(layer, 1)])).toBe(true);
    }
  });

  it("ignores a primary row that earned zero points", () => {
    expect(hasPrimary([c("symptom", 0)])).toBe(false);
  });
});

describe("POINTS", () => {
  it("matches the RISK_ENGINE §6 table", () => {
    expect(POINTS.threshold).toEqual({ monitorRange: 2, diagnosticRange: 4 });
    expect(POINTS.score.canrisk).toEqual({ high: 2, very_high: 3 });
    expect(POINTS.score.fib4).toEqual({ intermediate: 1, high: 4 });
    expect(POINTS.score.fliRuleIn).toBe(2);
    expect(POINTS.trend.crossingWithinYear).toBe(4);
    expect(POINTS.trend.crossingWithinHorizon).toBe(2);
    expect(POINTS.trend.towardNoCrossing).toBe(1);
    expect(POINTS.changepoint).toEqual({ adverse: 1, agreesWithTrend: 2 });
    expect([3, 4, 5].map((n) => POINTS.cooccurrence[n])).toEqual([3, 4, 4]);
    expect(POINTS.sleep).toEqual({ intermediate: 1, high: 2 });
    expect(POINTS.gap).toBe(1);
    expect(POINTS.layerCap).toBe(4);
  });
});

describe("text helpers", () => {
  it("formats durations in days, months, then years", () => {
    expect(duration(10)).toBe("10 days");
    expect(duration(0.2)).toBe("1 day");
    expect(duration(200)).toBe("7 months");
    expect(duration(730)).toBe("2.0 years");
  });

  it("formats units, numbers, plurals and dates", () => {
    expect(withUnit("5.4", "%")).toBe("5.4%");
    expect(withUnit("7.2", "mmol/L")).toBe("7.2 mmol/L");
    expect(num(0.3, 2)).toBe("0.3");
    expect(num(2)).toBe("2");
    expect(plural(1, "week")).toBe("1 week");
    expect(plural(6, "week")).toBe("6 weeks");
    expect(monthDay(Date.UTC(2026, 8, 3, 23, 0))).toBe("Sep 3");
  });
});
